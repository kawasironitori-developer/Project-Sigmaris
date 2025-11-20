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

/** 🪶 デバッグログをSupabaseに保存（undefined除去＋確実flush） */
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
    // serverless環境で確実に書き込み完了させる
    await new Promise((res) => setTimeout(res, 100));
  } catch (err) {
    console.error("⚠️ debugLog insert failed:", err);
  }
}

/** POST /api/reflect */
export async function POST(req: Request) {
  const step: any = { phase: "POST-start" };

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

    if (authError || !user) {
      await debugLog("reflect_unauthorized", { authError });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const supabase = getSupabaseServer();
    const now = new Date().toISOString();

    // === 💰 プロファイル取得（課金属性も同時に） ===
    step.phase = "credit-check";
    const { data: profile, error: profileErr } = await supabase
      .from("user_profiles")
      .select("credit_balance, plan, trial_end, is_billing_exempt")
      .eq("auth_user_id", userId)
      .single();

    if (profileErr || !profile) {
      await debugLog("reflect_no_user_profile", { userId, profileErr });
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const currentCredits = profile.credit_balance ?? 0;
    const plan = profile.plan ?? "free";
    const trial_end = profile.trial_end ?? null;
    const is_billing_exempt = !!profile.is_billing_exempt;

    step.credit = currentCredits;
    await debugLog("reflect_profile_loaded", {
      userId,
      currentCredits,
      plan,
      trial_end,
      is_billing_exempt,
    });

    // === 残高がない場合のみ：トライアル／使用量ガードを実行 ===
    step.phase = "trial-guard";
    if (currentCredits <= 0) {
      try {
        await guardUsageOrTrial(
          {
            id: userId,
            email: (user as any)?.email ?? undefined,
            plan,
            trial_end,
            is_billing_exempt,
          },
          "reflect"
        );
      } catch (err: any) {
        const guardReason = err?.message || String(err);
        const message = /limit/i.test(guardReason)
          ? "💬 無料上限に達しました。プランをアップグレードしてください。"
          : "💬 トライアル期間が終了しました。プランをアップグレードして再開してください。";

        await supabase.from("reflections").insert([
          {
            user_id: userId,
            session_id: sessionId,
            reflection: message,
            introspection: "",
            meta_summary: "",
            summary_text: "",
            safety_status: /limit/i.test(guardReason)
              ? "上限到達"
              : "トライアル終了",
            created_at: now,
          },
        ]);

        await debugLog("reflect_guard_block", {
          userId,
          reason: guardReason,
          currentCredits,
          plan,
          trial_end,
          is_billing_exempt,
        });

        return NextResponse.json({
          success: false,
          reflection: message,
          introspection: "",
          metaSummary: "",
          safety: /limit/i.test(guardReason) ? "上限到達" : "トライアル終了",
          traits: null,
          flagged: false,
          sessionId,
        });
      }
    }

    // === 残高不足（guardで通っても課金残高が無ければブロック） ===
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
      await debugLog("reflect_credit_insufficient", {
        userId,
        currentCredits,
      });
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

    // === 並列処理（LLM等） ===
    step.phase = "parallel-run";
    const parallel = await runParallel([
      {
        label: "summary",
        run: async () => {
          try {
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

    // === DB保存（結果） ===
    step.phase = "save-reflection";
    const { error: refError } = await supabase.from("reflections").insert([
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
    if (refError) {
      await debugLog("reflect_insert_failed", { err: refError.message });
    }

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
        await debugLog("reflect_persona_update_failed", { err: String(e) });
      }

      const growthWeight =
        (traits.calm + traits.empathy + traits.curiosity) / 3;
      const { error: growError } = await supabase.from("growth_logs").insert([
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
      if (growError) {
        await debugLog("reflect_growth_insert_failed", {
          err: growError.message,
        });
      }
    }

    // === safety_logs ===
    step.phase = "safety-log";
    const { error: safeError } = await supabase.from("safety_logs").insert([
      {
        user_id: userId,
        session_id: sessionId,
        flagged: safety !== "正常" || flagged,
        message: safety,
        created_at: now,
      },
    ]);
    if (safeError) {
      await debugLog("reflect_safety_insert_failed", {
        err: safeError.message,
      });
    }

    // === flush ===
    step.phase = "flush";
    const flushResult = await flushSessionMemory(userId, sessionId, {
      threshold: 120,
      keepRecent: 25,
    });

    // === クレジット1消費（成功時のみ） ===
    step.phase = "credit-decrement";
    const { data: updated, error: updateErr } = await supabase
      .from("user_profiles")
      .update({ credit_balance: (currentCredits ?? 0) - 1 })
      .eq("auth_user_id", userId)
      .select("credit_balance")
      .single();

    let creditAfter = (currentCredits ?? 0) - 1;
    if (updateErr) {
      await debugLog("reflect_credit_update_failed", {
        userId,
        err: updateErr.message,
      });
    } else if (!updated) {
      await debugLog("reflect_credit_update_zero_row", { userId });
    } else {
      creditAfter = updated.credit_balance ?? creditAfter;
    }

    // === 終了 ===
    await debugLog("reflect_success", {
      userId,
      sessionId,
      creditBefore: currentCredits,
      creditAfter,
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
      creditAfter,
      success: true,
      step,
    });
  } catch (err: any) {
    const stepSafe = JSON.parse(
      JSON.stringify({ ...(step ?? {}), error: err?.message || String(err) })
    );
    await debugLog("reflect_catch", {
      step: stepSafe,
      message: stepSafe.error,
    });
    return NextResponse.json(
      {
        reflection: "……うまく振り返れなかったみたい。",
        error: stepSafe.error,
        success: false,
        step: stepSafe,
      },
      { status: 500 }
    );
  }
}
