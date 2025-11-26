// /engine/state/states/IdleState.ts
import { StateContext, SigmarisState } from "../StateContext";

/**
 * IdleState v3.0（完全整合版）
 * ----------------------------------------------
 * ・Emotion フォールバック（必ず実行）
 * ・Idle 中は Emotion を自然収束
 * ・SelfReferent / meta / hint 情報は Idle 時に軽くリセット
 * ・入力が空なら Idle 継続
 * ・入力があれば Dialogue へ遷移
 */
export class IdleState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    /* ----------------------------------------------------
     * 0) Emotion フォールバック（TS 安全）
     * ---------------------------------------------------- */
    if (!ctx.emotion) {
      ctx.emotion = {
        tension: 0.1,
        warmth: 0.2,
        hesitation: 0.1,
      };
    }

    /* ----------------------------------------------------
     * 1) Idle は認知ループの「休息ポイント」
     *    Emotion を自然減衰 → 過負荷を防ぐ
     * ---------------------------------------------------- */
    ctx.emotion = {
      tension: Math.max(0, Math.min(1, ctx.emotion.tension * 0.85)),
      warmth: Math.max(0, Math.min(1, ctx.emotion.warmth * 0.98)),
      hesitation: Math.max(0, Math.min(1, ctx.emotion.hesitation * 0.9)),
    };

    /* ----------------------------------------------------
     * 2) Idle 中に meta 情報の軽いリセット
     *    （ReflectHint/reflectCount はここで必ず整える）
     * ---------------------------------------------------- */
    if (!ctx.meta) ctx.meta = {};
    ctx.meta.reflectHint = null;
    ctx.reflectCount = 0;

    /* ----------------------------------------------------
     * 3) 入力が空 → Idle 継続
     * ---------------------------------------------------- */
    const cleaned: string =
      typeof ctx.input === "string" ? ctx.input.trim() : "";

    if (!cleaned) {
      ctx.input = "";
      return "Idle";
    }

    /* ----------------------------------------------------
     * 4) 入力あり → Dialogue へ遷移
     * ---------------------------------------------------- */
    return "Dialogue";
  }
}
