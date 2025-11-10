// /app/api/reflect/route.ts
export const dynamic = "force-dynamic"; // cookies使用のため静的ビルド禁止
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

/** 🪶 デバッグログをSupabaseに保存 */
async function debugLog(phase: string, payload: any) {
  try {
    const supabase = getSupabaseServer();
    await supabase.from("debug_logs").insert([{ phase, payload }]);
  } catch (err) {
    console.error("⚠️ debugLog insert failed:", err);
  }
}

/** POST /api/reflect */
export async function POST(req: Request) {
  const step: any = { phase: "init" };

  try {
    // === 入力受け取り ===
    const body = (await req.json()) as {
      messages?: any[];
      growthLog?: any[];
      history?: string[];
    };
    const messages = body.messages ?? [];
    const growthLog = body.growthLog ?? [];
    const history = body.history ?? [];
    const sessionId = req.headers.get("x-session-id") || crypto.randomUUID();

    // === 認証 ===
    step.phase = "auth";
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = user.id;
    const supabase = getSupabaseServer();
    const now = new Date().toISOString();

    // === 💰 クレジットチェック ===
    step.phase = "credit-check";
    const { data: profile, error: creditErr } = await supabase
      .from("user_profiles")
      .select("credit_balance")
      .eq("auth_user_id", userId)
      .single();

    if (creditErr || !profile)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    const currentCredits = profile.credit_balance ?? 0;
    step.credit = currentCredits;

    // ⚠️ 残高不足ブロック
    if (currentCredits <= 0) {
      const message =
        "💬 クレジットが不足しています。チャージまたはプラン変更を行ってください。";
      await supabase.from("reflections").insert([
        {
          user_id: userId,
          session_id: sessionId,
          reflection: message,
          introspection: "",
          meta_summary: "",
          summary_text: "",
          safety_status: "残高不足",
          created_at: now,
        },
      ]);
      return NextResponse.json({
        success: false,
        reflection: message,
        introspection: "",
        metaSummary: "",
        safety: "残高不足",
        traits: null,
        flagged: false,
        sessionId,
      });
    }

    // === トライアルガード（有効残高がある場合でも適用） ===
    step.phase = "trial-guard";
    let trialExpired = false;
    try {
      await guardUsageOrTrial(
        {
          id: userId,
          email: (user as any)?.email ?? undefined,
          plan: (user as any)?.plan ?? undefined,
          trial_end: (user as any)?.trial_end ?? null,
          is_billing_exempt: (user as any)?.is_billing_exempt ?? false,
        },
        "reflect"
      );
    } catch (err: any) {
      trialExpired = true;
      console.warn("⚠️ Trial expired — reflect blocked");
      await debugLog("reflect_trial_expired", { userId, err: err?.message });
    }

    if (trialExpired) {
      const message =
        "💬 トライアル期間が終了しました。プランをアップグレードして再開してください。";
      await supabase.from("reflections").insert([
        {
          user_id: userId,
          session_id: sessionId,
          reflection: message,
          introspection: "",
          meta_summary: "",
          summary_text: "",
          safety_status: "トライアル終了",
          created_at: now,
        },
      ]);
      return NextResponse.json({
        success: false,
        reflection: message,
        introspection: "",
        metaSummary: "",
        safety: "トライアル終了",
        traits: null,
        flagged: false,
        sessionId,
      });
    }

    // === クレジット1消費 ===
    step.phase = "credit-decrement";
    const newCredits = currentCredits - 1;
    const { error: updateErr } = await supabase
      .from("user_profiles")
      .update({ credit_balance: newCredits })
      .eq("auth_user_id", userId);

    if (updateErr)
      console.warn("credit_balance update failed:", updateErr.message);

    // === 並列処理 ===
    step.phase = "parallel-run";
    const parallel = await runParallel([
      {
        label: "summary",
        run: async () => {
          try {
            return await summarize(messages.slice(0, -10));
          } catch (err) {
            console.warn("summary failed:", err);
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
            console.error("ReflectionEngine error:", err);
            await debugLog("reflect_engine_error", { err: String(err) });
            return null;
          }
        },
      },
    ]);

    const summary = parallel.summary ?? "";
    const reflectionResult = parallel.reflection as ReflectionResult | null;

    if (!reflectionResult) {
      await debugLog("reflect_result_null", { userId, sessionId });
      return NextResponse.json(
        { success: false, error: "ReflectionEngine returned null" },
        { status: 500 }
      );
    }

    // === 結果抽出 ===
    const reflectionText = reflectionResult.reflection ?? "（内省なし）";
    const introspection = reflectionResult.introspection ?? "";
    const metaSummary = reflectionResult.metaSummary ?? "";
    const safety = reflectionResult.safety ?? "正常";
    const metaReport = reflectionResult.metaReport ?? null;
    const traits = reflectionResult.traits ?? null;
    const flagged = reflectionResult.flagged ?? false;

    // === DB保存 ===
    step.phase = "save";
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

    // === PersonaSync + growth_logs ===
    step.phase = "persona-update";
    if (traits) {
      try {
        await PersonaSync.update(
          traits,
          metaSummary,
          metaReport?.growthAdjustment ?? 0,
          userId
        );
      } catch (e) {
        console.error("PersonaSync.update failed:", e);
      }

      const growthWeight =
        (traits.calm + traits.empathy + traits.curiosity) / 3;
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

    // === safety_logs ===
    step.phase = "safety-log";
    await supabase.from("safety_logs").insert([
      {
        user_id: userId,
        session_id: sessionId,
        flagged: safety !== "正常" || flagged,
        message: safety,
        created_at: now,
      },
    ]);

    // === flush ===
    step.phase = "flush";
    const flushResult = await flushSessionMemory(userId, sessionId, {
      threshold: 120,
      keepRecent: 25,
    });

    // === 終了 ===
    await debugLog("reflect_success", {
      userId,
      sessionId,
      creditAfter: newCredits,
      reflectionPreview: reflectionText.slice(0, 60),
    });

    return NextResponse.json({
      reflection: reflectionText,
      introspection,
      metaSummary,
      safety,
      metaReport,
      traits,
      flagged,
      sessionId,
      summaryUsed: !!summary,
      flush: flushResult ?? null,
      creditAfter: newCredits,
      success: true,
      step,
    });
  } catch (err: any) {
    step.error = err?.message || String(err);
    console.error("[ReflectAPI Error]", err);
    await debugLog("reflect_catch", { step, message: step.error });
    return NextResponse.json(
      {
        reflection: "……うまく振り返れなかったみたい。",
        error: step.error,
        success: false,
        step,
      },
      { status: 500 }
    );
  }
}
