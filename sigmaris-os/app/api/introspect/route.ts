// /app/api/introspect/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import { getSupabaseServer } from "@/lib/supabaseServer";
import { summarize } from "@/lib/summary";
import { runParallel } from "@/lib/parallelTasks";
import { flushSessionMemory } from "@/lib/memoryFlush";
import { guardUsageOrTrial } from "@/lib/guard";

import { PersonaSync } from "@/engine/sync/PersonaSync";
import type { TraitVector } from "@/lib/traits";
import type { MetaReport } from "@/engine/meta/MetaReflectionEngine";

import { introspect as coreIntrospect } from "@/lib/sigmaris-api";

interface IntrospectResult {
  reflection?: string;
  introspection?: string;
  meta_summary?: string;
  safety?: string;
  meta_report?: MetaReport;
  traits?: TraitVector;
  flagged?: boolean;
}

/* ------------------------------------------
 * debugLog
 * ---------------------------------------- */
async function debugLog(phase: string, payload: any) {
  try {
    const safe = JSON.parse(JSON.stringify(payload ?? {}));
    const supabase = getSupabaseServer();

    await supabase.from("debug_logs").insert([
      {
        phase,
        payload: safe,
        created_at: new Date().toISOString(),
      },
    ]);

    await new Promise((res) => setTimeout(res, 80));
  } catch (e) {
    console.error("⚠️ introspect.debugLog failed", e);
  }
}

/* ------------------------------------------
 * POST /api/introspect
 * ---------------------------------------- */
export async function POST(req: Request) {
  const step: any = { phase: "start" };

  try {
    /* ------------------------------------------
     * 入力
     * ---------------------------------------- */
    const body = await req.json();
    const messages = body.messages ?? [];
    const growthLog = body.growthLog ?? [];
    const history = body.history ?? [];

    const sessionId = req.headers.get("x-session-id") || crypto.randomUUID();
    const now = new Date().toISOString();

    step.sessionId = sessionId;

    /* ------------------------------------------
     * 認証
     * ---------------------------------------- */
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authErr,
    } = await supabaseAuth.auth.getUser();

    if (authErr || !user) {
      await debugLog("introspect_unauthorized", { authErr });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const supabase = getSupabaseServer();

    /* ------------------------------------------
     * プロファイル読み込み
     * ---------------------------------------- */
    const { data: profile, error: pErr } = await supabase
      .from("user_profiles")
      .select("credit_balance, plan, trial_end, is_billing_exempt")
      .eq("auth_user_id", userId)
      .single();

    if (pErr || !profile) {
      await debugLog("introspect_no_profile", { pErr });
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const currentCredits = profile.credit_balance ?? 0;
    const plan = profile.plan ?? "free";
    const trial_end = profile.trial_end ?? null;
    const exempt = !!profile.is_billing_exempt;

    /* ------------------------------------------
     * クレジットなし → guard
     * ---------------------------------------- */
    if (currentCredits <= 0) {
      try {
        await guardUsageOrTrial(
          {
            id: userId,
            plan,
            trial_end,
            is_billing_exempt: exempt,
          },
          "introspect"
        );
      } catch (e: any) {
        const msg = /limit/i.test(e.message)
          ? "💬 無料上限に達しました。プランをアップグレードしてください。"
          : "💬 トライアル期間が終了しました。プラン変更が必要です。";

        await supabase.from("reflections").insert([
          {
            user_id: userId,
            session_id: sessionId,
            reflection: "",
            introspection: msg,
            meta_summary: "",
            summary_text: "",
            safety_status: "blocked",
            created_at: now,
          },
        ]);

        return NextResponse.json({
          success: false,
          reflection: "",
          introspection: msg,
          metaSummary: "",
          safety: "blocked",
          traits: null,
          flagged: false,
          sessionId,
        });
      }
    }

    /* ------------------------------------------
     * 並列実行：summary + AEI-core introspect
     * ---------------------------------------- */
    const parallel = await runParallel([
      {
        label: "summary",
        run: async () => {
          try {
            return await summarize(messages.slice(0, -10));
          } catch {
            return "";
          }
        },
      },
      {
        label: "core",
        run: async () => {
          try {
            return (await coreIntrospect()) as IntrospectResult;
          } catch (err) {
            await debugLog("core_error", { err: String(err) });
            return null;
          }
        },
      },
    ]);

    const summary = parallel.summary ?? "";
    const core = parallel.core as IntrospectResult | null;

    if (!core) {
      await debugLog("core_null", {});
      return NextResponse.json(
        { success: false, error: "Introspection core null" },
        { status: 500 }
      );
    }

    const reflectionText = core.reflection ?? "";
    const introspection =
      core.introspection ?? "（内省がまとまりませんでした）";
    const metaSummary = core.meta_summary ?? "";
    const safety = core.safety ?? "normal";
    const metaReport = core.meta_report ?? null;
    const traits = core.traits ?? null;

    /* ------------------------------------------
     * 保存
     * ---------------------------------------- */
    await supabase.from("reflections").insert([
      {
        user_id: userId,
        session_id: sessionId,
        reflection: reflectionText,
        introspection,
        meta_summary: metaSummary,
        summary_text: summary,
        safety_status: safety,
        created_at: now,
      },
    ]);

    /* ------------------------------------------
     * PersonaSync（B仕様）
     * ---------------------------------------- */
    if (traits) {
      const growth =
        metaReport?.growthAdjustment ??
        (traits.calm + traits.empathy + traits.curiosity) / 3;

      await PersonaSync.update(
        {
          traits,
          summary: metaSummary,
          growth,
          timestamp: now,
          baseline: null,
          identitySnapshot: null,
        },
        userId
      );

      await supabase.from("growth_logs").insert([
        {
          user_id: userId,
          session_id: sessionId,
          calm: traits.calm,
          empathy: traits.empathy,
          curiosity: traits.curiosity,
          weight: growth,
          created_at: now,
        },
      ]);
    }

    /* ------------------------------------------
     * safety_logs
     * ---------------------------------------- */
    await supabase.from("safety_logs").insert([
      {
        user_id: userId,
        session_id: sessionId,
        flagged: safety !== "normal",
        message: safety,
        created_at: now,
      },
    ]);

    /* ------------------------------------------
     * flush
     * ---------------------------------------- */
    const flushResult = await flushSessionMemory(userId, sessionId, {
      threshold: 180,
      keepRecent: 30,
    });

    /* ------------------------------------------
     * クレジット消費
     * ---------------------------------------- */
    await supabase
      .from("user_profiles")
      .update({ credit_balance: currentCredits - 1 })
      .eq("auth_user_id", userId);

    /* ------------------------------------------
     * 最終レスポンス
     * ---------------------------------------- */
    return NextResponse.json({
      success: true,
      reflection: reflectionText,
      introspection,
      metaSummary,
      safety,
      metaReport,
      traits,
      flagged: core.flagged ?? false,
      sessionId,
      summaryUsed: !!summary,
      flush: flushResult,
    });
  } catch (err: any) {
    await debugLog("catch", { err: String(err) });

    return NextResponse.json(
      {
        success: false,
        reflection: "",
        introspection: "……うまく内省できなかったみたい。",
        error: err?.message ?? "unknown",
      },
      { status: 500 }
    );
  }
}
