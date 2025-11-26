// /engine/state/states/OverloadPreventState.ts
import { StateContext, SigmarisState } from "../StateContext";

/**
 * OverloadPreventState v3.0（完全整合版）
 * -------------------------------------------------------
 * ・SafetyLayer の過負荷判定後に入る回復ステート
 * ・Emotion / Traits を緩やかに安定化
 * ・reflectHint / meta 情報を安全にリセット
 * ・回復条件成立で Dialogue 復帰
 * ・reflectCount による無限ループ防止
 */
export class OverloadPreventState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    /* ----------------------------------------------------
     * 0) Emotion fallback（型安全）
     * ---------------------------------------------------- */
    if (!ctx.emotion) {
      ctx.emotion = {
        tension: 0.25,
        warmth: 0.35,
        hesitation: 0.2,
      };
    }

    /* ----------------------------------------------------
     * 1) Safety モード出力
     * ---------------------------------------------------- */
    ctx.output =
      "（負荷調整モード）\n処理を少し落としてるよ。軽いペースで整えていくね。";

    /* ----------------------------------------------------
     * 2) reflect 周辺のヒントは必ずリセット
     * ---------------------------------------------------- */
    if (!ctx.meta) ctx.meta = {};
    ctx.meta.reflectHint = null;

    /* ----------------------------------------------------
     * 3) Traits（人格軌道）の安定化
     * ---------------------------------------------------- */
    ctx.traits = {
      calm: Math.min(1, ctx.traits.calm + 0.06),
      empathy: Math.min(1, ctx.traits.empathy + 0.02),
      curiosity: Math.max(0, ctx.traits.curiosity - 0.03),
    };

    /* ----------------------------------------------------
     * 4) Emotion の安定化（tension を大きく減衰）
     * ---------------------------------------------------- */
    ctx.emotion = {
      tension: Math.max(0, ctx.emotion.tension * 0.45),
      warmth: Math.max(0, Math.min(1, ctx.emotion.warmth * 0.96)),
      hesitation: Math.max(0, Math.min(1, ctx.emotion.hesitation + 0.04)),
    };

    /* ----------------------------------------------------
     * 5) 回復判定：calm > 0.48 → Dialogue に復帰
     * ---------------------------------------------------- */
    if (ctx.traits.calm > 0.48) {
      ctx.reflectCount = 0;
      return "Dialogue";
    }

    /* ----------------------------------------------------
     * 6) 無限ループ防止
     * ---------------------------------------------------- */
    if (ctx.reflectCount > 4) {
      ctx.reflectCount = 0;
      return "Dialogue";
    }

    /* ----------------------------------------------------
     * 7) 継続（次の OverloadPrevent サイクルへ）
     * ---------------------------------------------------- */
    ctx.reflectCount++;
    return "OverloadPrevent";
  }
}
