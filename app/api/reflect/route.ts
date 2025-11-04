// /app/api/reflect/route.ts
import { NextResponse } from "next/server";
import { ReflectionEngine } from "@/engine/ReflectionEngine";
import { PersonaSync } from "@/engine/sync/PersonaSync";
import type { TraitVector } from "@/lib/traits";
import type { MetaReport } from "@/engine/meta/MetaReflectionEngine";

/**
 * === ReflectionEngine の戻り値型 ===
 *  - 各エンジンモジュールの出力を統合して受け取る
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
 *  - クライアントからの内省リクエストを受け取り
 *  - ReflectionEngine → MetaReflectionEngine → PersonaSync へ連携
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

    // === ReflectionEngine 実行 ===
    const engine = new ReflectionEngine();
    const result = (await engine.fullReflect(
      growthLog,
      messages,
      history
    )) as ReflectionResult;

    // === 結果の抽出 ===
    const reflectionText = result?.reflection ?? "（内省なし）";
    const introspection = result?.introspection ?? "";
    const metaSummary = result?.metaSummary ?? "";
    const safety = result?.safety ?? "正常";
    const metaReport = result?.metaReport ?? null;

    // === PersonaSync へ traits 同期 ===
    const traits = result?.traits;
    if (traits) {
      PersonaSync.update(
        traits,
        metaSummary,
        metaReport?.growthAdjustment ?? 0
      );
    }

    // === フロントエンドへ返却 ===
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
