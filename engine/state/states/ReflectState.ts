// /engine/state/states/ReflectState.ts
import { StateContext, SigmarisState } from "../StateContext";
import { ReflectionEngine } from "@/engine/ReflectionEngine";

export class ReflectState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    const engine = new ReflectionEngine();

    /* ---------------------------------------------
     * 0) Emotion フォールバック（安全のため）
     * --------------------------------------------- */
    if (!ctx.emotion) {
      ctx.emotion = {
        tension: 0.1,
        warmth: 0.2,
        hesitation: 0.1,
      };
    }

    /* ---------------------------------------------
     * 1) Reflect（軽量内省）
     * --------------------------------------------- */
    let summary: string;

    try {
      summary = await engine.reflect(
        [], // v1では growthLog 未使用
        [
          {
            user: ctx.input,
            ai: ctx.output, // Dialogue の返答を参照
          },
        ]
      );
    } catch (err) {
      console.error("ReflectState error:", err);
      summary = "（内省処理に失敗したため、簡易的にまとめています）";
    }

    // ❗❗ ここが重要
    // → Reflect の文章を ctx.output に上書きしない
    ctx.meta.reflectSummary = summary;

    ctx.reflectCount++;

    /* ---------------------------------------------
     * 2) Emotion の微調整（Reflect の余韻）
     * --------------------------------------------- */
    ctx.emotion = {
      tension: Math.max(0, Math.min(1, ctx.emotion.tension * 0.8)),
      warmth: Math.max(0, Math.min(1, ctx.emotion.warmth + 0.02)),
      hesitation: Math.max(0, Math.min(1, ctx.emotion.hesitation * 0.9)),
    };

    /* ---------------------------------------------
     * 3) 次の状態へ
     * --------------------------------------------- */
    return "Introspect";
  }
}
