// /app/api/reflect/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";

import { ReflectionEngine } from "@/engine/ReflectionEngine";
import { PersonaSync } from "@/engine/sync/PersonaSync";
import type { TraitVector } from "@/lib/traits";
import type { MetaReport } from "@/engine/meta/MetaReflectionEngine";

/**
 * ReflectionEngine の戻り値型
 */
interface ReflectionResult {
  reflection: string;
  introspection: string;
  metaSummary: string;
  safety: string;
  metaReport?: MetaReport;
  traits?: TraitVector;
}

/**
 * === POST: Reflection 実行エンドポイント ===
 * - クライアントからの内省リクエストを受け取り
 * - ReflectionEngine → MetaReflectionEngine → PersonaSync（Supabase同期）へ連携
 * - Supabase上の `reflections`, `growth_logs`, `safety_logs`, `persona` を更新
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

    // === 認証情報取得 ===
    const supabaseClient = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // === ReflectionEngine 実行 ===
    const engine = new ReflectionEngine();
    const result = (await engine.fullReflect(
      growthLog,
      messages,
      history
    )) as ReflectionResult;

    // === 結果抽出 ===
    const reflectionText = result?.reflection ?? "（内省なし）";
    const introspection = result?.introspection ?? "";
    const metaSummary = result?.metaSummary ?? "";
    const safety = result?.safety ?? "正常";
    const metaReport = result?.metaReport ?? null;
    const traits = result?.traits ?? null;

    // === Supabaseへの反映開始 ===
    const now = new Date().toISOString();

    // 🧠 1. reflection履歴を保存
    const { error: refError } = await supabaseServer
      .from("reflections")
      .insert([
        {
          user_id: user.id,
          reflection: reflectionText,
          introspection,
          meta_summary: metaSummary,
          safety_status: safety,
          created_at: now,
        },
      ]);
    if (refError) console.warn("⚠️ reflections insert failed:", refError);

    // 💾 2. PersonaSyncでpersonaテーブルを更新
    if (traits) {
      await PersonaSync.update(
        traits,
        metaSummary,
        metaReport?.growthAdjustment ?? 0
      );

      // 💹 3. growth_logsも更新
      const growthWeight =
        (traits.calm + traits.empathy + traits.curiosity) / 3;

      const { error: growError } = await supabaseServer
        .from("growth_logs")
        .insert([
          {
            user_id: user.id,
            calm: traits.calm,
            empathy: traits.empathy,
            curiosity: traits.curiosity,
            weight: growthWeight,
            created_at: now,
          },
        ]);
      if (growError) console.warn("⚠️ growth_logs insert failed:", growError);
    }

    // 🧩 4. safetyログ保存
    const { error: safeError } = await supabaseServer
      .from("safety_logs")
      .insert([
        {
          user_id: user.id,
          flagged: safety !== "正常",
          message: safety,
          created_at: now,
        },
      ]);
    if (safeError) console.warn("⚠️ safety_logs insert failed:", safeError);

    // === レスポンス ===
    return NextResponse.json({
      reflection: reflectionText,
      introspection,
      metaSummary,
      safety,
      metaReport,
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
