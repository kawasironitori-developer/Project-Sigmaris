// /app/api/reflect/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";

import { ReflectionEngine } from "@/engine/ReflectionEngine";
import { PersonaSync } from "@/engine/sync/PersonaSync";
import { summarize } from "@/lib/summary";
import { runParallel } from "@/lib/parallelTasks"; // 並列実行
import { flushSessionMemory } from "@/lib/memoryFlush"; // 履歴圧縮
import { guardUsageOrTrial } from "@/lib/guard"; // 🆕 課金・上限ガード
import type { TraitVector } from "@/lib/traits";
import type { MetaReport } from "@/engine/meta/MetaReflectionEngine";

console.log("🌐 /api/reflect endpoint loaded");

interface ReflectionResult {
  reflection: string;
  introspection: string;
  metaSummary: string;
  safety: string;
  metaReport?: MetaReport;
  traits?: TraitVector;
  flagged?: boolean;
}

/**
 * === POST: Reflection 実行エンドポイント ===
 * - ReflectionEngine → MetaReflectionEngine → PersonaSync（Supabase同期）
 * - summarize + flush を組み込み、高速化・安定化
 * - 課金／試用ガード（reflect カウント）
 */
export async function POST(req: Request) {
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

    // === セッションID（ヘッダー or 新規UUID）===
    const sessionId = req.headers.get("x-session-id") || crypto.randomUUID();

    // === 認証 ===
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      console.warn("⚠️ Unauthorized access attempt to /api/reflect");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 🛡️ 課金／試用ガード（reflect 用）— 型ずれ回避のため軽く正規化
    const billingUser = {
      id: user.id,
      email: (user as any)?.email ?? undefined,
      plan: (user as any)?.plan ?? undefined,
      trial_end: (user as any)?.trial_end ?? null,
      is_billing_exempt: (user as any)?.is_billing_exempt ?? false,
    };
    await guardUsageOrTrial(billingUser, "reflect");

    const userId = user.id;
    const now = new Date().toISOString();
    console.log("🚀 [ReflectAPI] Start reflection for:", { userId, sessionId });

    // === 並列で summarize + ReflectionEngine を実行 ===
    const parallel = await runParallel([
      {
        label: "summary",
        run: async () => {
          // 直近は ReflectionEngine に渡すので、前段を要約
          return await summarize(messages.slice(0, -10));
        },
      },
      {
        label: "reflection",
        run: async () => {
          const engine = new ReflectionEngine();
          return (await engine.fullReflect(
            growthLog,
            messages.slice(-10), // 直近のみ詳細を渡す
            "", // summaryは後で使う（LLM負荷分離）
            userId
          )) as ReflectionResult;
        },
      },
    ]);

    // === 要約と内省結果を統合 ===
    const summary = parallel.summary ?? "";
    const reflectionResult = parallel.reflection as ReflectionResult;

    if (!reflectionResult) {
      console.warn("⚠️ ReflectionEngine returned null");
      return NextResponse.json(
        { error: "ReflectionEngine returned null", success: false },
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

    console.log("🪞 Reflection result:", {
      reflectionText,
      metaSummary,
      traits,
      safety,
      flagged,
    });

    const supabase = getSupabaseServer();

    // 🧠 1. reflections 履歴を保存（summary付き）
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
    if (refError)
      console.warn("⚠️ reflections insert failed:", refError.message);

    // 💾 2. PersonaSync + growth_logs 更新
    if (traits) {
      console.log("🧩 Updating PersonaSync & growth logs...");
      try {
        await PersonaSync.update(
          traits,
          metaSummary,
          metaReport?.growthAdjustment ?? 0,
          userId
        );
        console.log("✅ PersonaSync.update success:", traits);
      } catch (e) {
        console.error("⚠️ PersonaSync.update failed:", e);
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
      if (growError)
        console.warn("⚠️ growth_logs insert failed:", growError.message);
      else console.log("📈 Growth log updated:", growthWeight.toFixed(3));
    } else {
      console.warn("⚠️ No traits found in reflection result — Persona skipped");
    }

    // 🧩 3. safety_logs 保存
    const { error: safeError } = await supabase.from("safety_logs").insert([
      {
        user_id: userId,
        session_id: sessionId,
        flagged: safety !== "正常" || flagged,
        message: safety,
        created_at: now,
      },
    ]);
    if (safeError)
      console.warn("⚠️ safety_logs insert failed:", safeError.message);

    // 🧹 4. flushSessionMemory：履歴圧縮
    const flushResult = await flushSessionMemory(userId, sessionId, {
      threshold: 120,
      keepRecent: 25,
    });
    if (flushResult?.didFlush) {
      console.log(
        `🧹 Memory flushed: deleted ${flushResult.deletedCount}, kept ${flushResult.keptCount}`
      );
    }

    console.log("✅ Reflection process complete for:", { userId, sessionId });

    // === レスポンス ===
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
      updatedHistory: [...history, introspection],
      success: true,
    });
  } catch (err: any) {
    console.error("[ReflectAPI Error]", err);
    return NextResponse.json(
      {
        reflection: "……うまく振り返れなかったみたい。",
        error: err?.message ?? String(err),
        success: false,
      },
      { status: 500 }
    );
  }
}
