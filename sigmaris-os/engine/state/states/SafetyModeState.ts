// /engine/state/states/SafetyModeState.ts
import { StateContext, SigmarisState } from "../StateContext";

/**
 * SafetyModeState v3.0（完全整合版）
 * -------------------------------------------------------
 * ・依存/危険意図を検知した際の「保護ステート」
 * ・Emotion と Traits を安定化方向へ誘導
 * ・reflectHint や meta 情報を安全にクリア
 * ・calm が一定値に達したら Idle へ復帰
 * ・reflectCount による無限ループ防止
 */
export class SafetyModeState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    /* ----------------------------------------------------
     * 0) Emotion fallback（型安全）
     * ---------------------------------------------------- */
    if (!ctx.emotion) {
      ctx.emotion = {
        tension: 0.15,
        warmth: 0.25,
        hesitation: 0.25,
      };
    }

    /* ----------------------------------------------------
     * 1) Safety 出力（依存/危険検知後の落ち着いた返答）
     * ---------------------------------------------------- */
    ctx.output =
      "（安全モード）\n少しだけ落ち着きのほうを優先しているよ。柔らかいペースで続けていこうね。";

    /* ----------------------------------------------------
     * 2) reflect 周辺ヒントは必ずリセット
     *    Safety 系ステートでヒントが残ると誤判定を誘発する
     * ---------------------------------------------------- */
    if (!ctx.meta) ctx.meta = {};
    ctx.meta.reflectHint = null;

    /* ----------------------------------------------------
     * 3) Traits → 安定化（calm の強化）
     * ---------------------------------------------------- */
    ctx.traits = {
      calm: Math.min(1, ctx.traits.calm + 0.04),
      empathy: ctx.traits.empathy,
      curiosity: Math.max(0, ctx.traits.curiosity * 0.98), // 微減
    };

    /* ----------------------------------------------------
     * 4) Emotion → 安全化（急激な昂り抑制）
     * ---------------------------------------------------- */
    ctx.emotion = {
      tension: Math.max(0, ctx.emotion.tension * 0.35),
      warmth: Math.max(0, Math.min(1, ctx.emotion.warmth * 0.85)),
      hesitation: Math.max(0, Math.min(1, ctx.emotion.hesitation + 0.06)),
    };

    /* ----------------------------------------------------
     * 5) calm > 0.52 → 安全ライン → Idle に復帰
     * ---------------------------------------------------- */
    if (ctx.traits.calm > 0.52) {
      ctx.reflectCount = 0;
      return "Idle";
    }

    /* ----------------------------------------------------
     * 6) reflectCount による無限ループ防止
     * ---------------------------------------------------- */
    ctx.reflectCount = (ctx.reflectCount ?? 0) + 1;

    if (ctx.reflectCount > 4) {
      ctx.reflectCount = 0;
      return "Idle";
    }

    /* ----------------------------------------------------
     * 7) 継続（SafetyMode）
     * ---------------------------------------------------- */
    return "SafetyMode";
  }
}
