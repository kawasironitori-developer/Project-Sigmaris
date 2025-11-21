// /app/api/reflect/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import { getSupabaseServer } from "@/lib/supabaseServer";
import { ReflectionEngine } from "@/engine/ReflectionEngine";
import { PersonaSync } from "@/engine/sync/PersonaSync";
import { summarize } from "@/lib/summary";
import { runParallel } from "@/lib/parallelTasks";
import { flushSessionMemory } from "@/lib/memoryFlush";
import { guardUsageOrTrial } from "@/lib/guard";

import type { TraitVector } from "@/lib/traits";
import type { MetaReport } from "@/engine/meta/MetaReflectionEngine";

interface ReflectionResult {
  reflection: string;
  introspection: string;
  metaSummary: string;
  safety: string;
  metaReport?: MetaReport;
  traits?: TraitVector;
  flagged?: boolean;
}

/* -------------------------------------------------------
 * debug log
 * ----------------------------------------------------- */
async function debugLog(phase: string, payload: any) {
  try {
    const safePayload = JSON.parse(JSON.stringify(payload ?? {}));
    const supabase = getSupabaseServer();
    await supabase.from("debug_logs").insert([
      {
        phase,
        payload: safePayload,
        created_at: new Date().toISOString(),
      },
    ]);
    await new Promise((res) => setTimeout(res, 100));
  } catch (err) {
    console.error("⚠ debugLog failed:", err);
  }
}

/* -------------------------------------------------------
 * POST /api/reflect
 * ----------------------------------------------------- */
export async function POST(req: Request) {
  const step: any = { phase: "POST-start" };

  try {
    /* -------------------------
     * 入力
     * ----------------------- */
    const body = (await req.json()) as {
      messages?: any[];
      growthLog?: any[];
      history?: string[];
    };

    const messages = body.messages ?? [];
    const growthLog = body.growthLog ?? [];
    const sessionId = req.headers.get("x-session-id") || crypto.randomUUID();
    const now = new Date().toISOString();
    step.sessionId = sessionId;

    /* -------------------------
     * 認証
     * ----------------------- */
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      await debugLog("reflect_unauthorized", { authError });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const supabase = getSupabaseServer();

    /* -------------------------
     * プロファイル取得
     * ----------------------- */
    const { data: profile, error: profileErr } = await supabase
      .from("user_profiles")
      .select("credit_balance, plan, trial_end, is_billing_exempt")
      .eq("auth_user_id", userId)
      .single();

    if (profileErr || !profile) {
      await debugLog("reflect_profile_missing", { userId, profileErr });
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const currentCredits = profile.credit_balance ?? 0;

    /* -------------------------
     * クレジット / トライアルガード
     * ----------------------- */
    if (currentCredits <= 0) {
      try {
        await guardUsageOrTrial(
          {
            id: userId,
            email: (user as any)?.email ?? undefined,
            plan: profile.plan,
            trial_end: profile.trial_end,
            is_billing_exempt: profile.is_billing_exempt,
          },
          "reflect"
        );
      } catch (err: any) {
        const message = /limit/i.test(err?.message)
          ? "💬 無料上限に達しました。アップグレードしてください。"
          : "💬 トライアル期間が終了しました。アップグレードしてください。";

        await supabase.from("reflections").insert([
          {
            user_id: userId,
            session_id: sessionId,
            reflection: message,
            introspection: "",
            meta_summary: "",
            summary_text: "",
            safety_status: /limit/i.test(err?.message)
              ? "上限到達"
              : "トライアル終了",
            created_at: now,
          },
        ]);

        return NextResponse.json({
          success: false,
          reflection: message,
          introspection: "",
          metaSummary: "",
          safety: /limit/i.test(err?.message) ? "上限到達" : "トライアル終了",
          traits: null,
          flagged: false,
          sessionId,
        });
      }
    }

    /* -------------------------
     * 並列処理（summary + ReflectionEngine）
     * ----------------------- */
    const parallel = await runParallel([
      {
        label: "summary",
        run: async () => {
          try {
            if (!messages || messages.length <= 10) return "";
            return await summarize(messages.slice(0, -10));
          } catch (err) {
            await debugLog("reflect_summary_failed", { err: String(err) });
            return "";
          }
        },
      },
      {
        label: "reflection",
        run: async () => {
          try {
            const engine = new ReflectionEngine();
            const result = await engine.fullReflect(
              growthLog,
              messages.slice(-10),
              "",
              userId
            );
            return result as ReflectionResult;
          } catch (err) {
            await debugLog("reflect_engine_failed", { err: String(err) });
            return null;
          }
        },
      },
    ]);

    const summary = parallel.summary ?? "";
    const reflectionResult = parallel.reflection as ReflectionResult | null;

    if (!reflectionResult) {
      return NextResponse.json(
        { success: false, error: "ReflectionEngine returned null" },
        { status: 500 }
      );
    }

    /* -------------------------
     * 結果抽出
     * ----------------------- */
    const reflectionText = reflectionResult.reflection ?? "";
    const introspection = reflectionResult.introspection ?? "";
    const metaSummary = reflectionResult.metaSummary ?? "";
    const safety = reflectionResult.safety ?? "normal";
    const metaReport = reflectionResult.metaReport ?? null;
    const traits = reflectionResult.traits ?? null;
    const flagged = reflectionResult.flagged ?? false;

    /* -------------------------
     * DB 保存（reflections）
     * ----------------------- */
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

    /* -------------------------
     * PersonaSync.update（B仕様）
     * ----------------------- */
    if (traits) {
      const growthWeight =
        (traits.calm + traits.empathy + traits.curiosity) / 3;

      await PersonaSync.update(
        {
          traits,
          summary: metaSummary,
          growth: growthWeight,
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
          weight: growthWeight,
          created_at: now,
        },
      ]);
    }

    /* -------------------------
     * safety_logs
     * ----------------------- */
    await supabase.from("safety_logs").insert([
      {
        user_id: userId,
        session_id: sessionId,
        flagged: safety !== "normal" || flagged,
        message: safety,
        created_at: now,
      },
    ]);

    /* -------------------------
     * flush
     * ----------------------- */
    const flushResult = await flushSessionMemory(userId, sessionId, {
      threshold: 120,
      keepRecent: 25,
    });

    /* -------------------------
     * クレジット減算
     * ----------------------- */
    const { data: updated } = await supabase
      .from("user_profiles")
      .update({ credit_balance: currentCredits - 1 })
      .eq("auth_user_id", userId)
      .select("credit_balance")
      .single();

    const creditAfter = updated?.credit_balance ?? currentCredits - 1;

    /* -------------------------
     * 完了
     * ----------------------- */
    return NextResponse.json({
      success: true,
      reflection: reflectionText,
      introspection,
      metaSummary,
      safety,
      traits,
      flagged,
      metaReport,
      summaryUsed: !!summary,
      flush: flushResult,
      creditAfter,
      sessionId,
      step,
    });
  } catch (err: any) {
    const stepSafe = JSON.parse(
      JSON.stringify({ ...(step ?? {}), error: err?.message })
    );

    await debugLog("reflect_error", stepSafe);

    return NextResponse.json(
      {
        success: false,
        reflection: "……うまく振り返れなかったみたい。",
        error: stepSafe.error,
        step: stepSafe,
      },
      { status: 500 }
    );
  }
}
