// /app/api/reflect/route.ts
export const dynamic = "force-dynamic"; // ← 静的ビルド禁止（cookies使用のため）

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

/**
 * POST /api/reflect
 * ----------------------------------------
 * - ReflectionEngine → MetaReflectionEngine → PersonaSync
 * - summarize + flush 組み込み（軽量化）
 * - guardUsageOrTrial（reflectカウント）
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

    // === セッションID ===
    const sessionId = req.headers.get("x-session-id") || crypto.randomUUID();

    // === 認証 ===
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // === トライアル・課金ガード ===
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

    // === 並列処理 ===
    const parallel = await runParallel([
      {
        label: "summary",
        run: async () => await summarize(messages.slice(0, -10)),
      },
      {
        label: "reflection",
        run: async () => {
          const engine = new ReflectionEngine();
          return (await engine.fullReflect(
            growthLog,
            messages.slice(-10),
            "",
            userId
          )) as ReflectionResult;
        },
      },
    ]);

    const summary = parallel.summary ?? "";
    const reflectionResult = parallel.reflection as ReflectionResult;
    if (!reflectionResult)
      return NextResponse.json(
        { error: "ReflectionEngine returned null" },
        { status: 500 }
      );

    // === 結果抽出 ===
    const reflectionText = reflectionResult.reflection ?? "（内省なし）";
    const introspection = reflectionResult.introspection ?? "";
    const metaSummary = reflectionResult.metaSummary ?? "";
    const safety = reflectionResult.safety ?? "正常";
    const metaReport = reflectionResult.metaReport ?? null;
    const traits = reflectionResult.traits ?? null;
    const flagged = reflectionResult.flagged ?? false;

    const supabase = getSupabaseServer();

    // === reflections保存 ===
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
    if (refError) console.warn("reflections insert failed:", refError.message);

    // === PersonaSync + growth_logs ===
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
        console.warn("growth_logs insert failed:", growError.message);
    }

    // === safety_logs ===
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
      console.warn("safety_logs insert failed:", safeError.message);

    // === flush ===
    const flushResult = await flushSessionMemory(userId, sessionId, {
      threshold: 120,
      keepRecent: 25,
    });

    // === 返却 ===
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
  } catch (err) {
    console.error("[ReflectAPI Error]", err);
    return NextResponse.json(
      {
        reflection: "……うまく振り返れなかったみたい。",
        error: err instanceof Error ? err.message : String(err),
        success: false,
      },
      { status: 500 }
    );
  }
}
