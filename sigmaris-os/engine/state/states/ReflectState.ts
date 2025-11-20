// /engine/state/states/ReflectState.ts

import { StateContext, SigmarisState } from "../StateContext";
import { ReflectionEngine } from "@/engine/ReflectionEngine";

export class ReflectState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    const engine = new ReflectionEngine();

    /* ---------------------------------------------
     * 0) Emotion フォールバック（安全のため）
     * --------------------------------------------- */
    ctx.emotion = ctx.emotion ?? {
      tension: 0.1,
      warmth: 0.2,
      hesitation: 0.1,
    };

    /* ---------------------------------------------
     * 1) Reflect（軽量内省）— 出力は UI 用の「reflection」へ保存
     * --------------------------------------------- */
    let summary = "";

    try {
      summary = await engine.reflect(
        [], // v1: growthLog 未使用
        [
          {
            user: ctx.input,
            ai: ctx.output, // DialogueState の返答を参照
          },
        ]
      );
    } catch (err) {
      console.error("[ReflectState] ReflectionEngine error:", err);
      summary = "（内省処理に失敗したため、簡易的にまとめています）";
    }

    // Reflect の結果は ctx.output ではなく UI 用メタ領域に保存する
    ctx.meta.reflection = summary;
    ctx.reflectCount++;

    /* ---------------------------------------------
     * 2) Emotion 微調整（Reflect 後の落ち着き）
     * --------------------------------------------- */
    ctx.emotion = {
      tension: Math.max(0, Math.min(1, ctx.emotion.tension * 0.82)),
      warmth: Math.max(0, Math.min(1, ctx.emotion.warmth + 0.015)),
      hesitation: Math.max(0, Math.min(1, ctx.emotion.hesitation * 0.88)),
    };

    /* ---------------------------------------------
     * 3) 次の状態へ（Introspect）
     * --------------------------------------------- */
    return "Introspect";
  }
}
