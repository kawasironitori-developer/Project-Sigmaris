// /engine/state/states/IdleState.ts
import { StateContext, SigmarisState } from "../StateContext";

export class IdleState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    /* ----------------------------------------------------
     * 0) Emotion フォールバック（TS安全性のため必ず実行）
     * ---------------------------------------------------- */
    if (!ctx.emotion) {
      ctx.emotion = {
        tension: 0.1,
        warmth: 0.2,
        hesitation: 0.1,
      };
    }

    /* ----------------------------------------------------
     * 1) Idle は「呼吸ポイント」→ Emotion をゆっくり収束
     * ---------------------------------------------------- */
    ctx.emotion = {
      tension: Math.max(0, ctx.emotion.tension * 0.85),
      warmth: Math.max(0, Math.min(1, ctx.emotion.warmth * 0.98)),
      hesitation: Math.max(0, ctx.emotion.hesitation * 0.9),
    };

    /* ----------------------------------------------------
     * 2) ユーザー入力が空 → Idle 継続
     * ---------------------------------------------------- */
    const cleaned = ctx.input?.trim() ?? "";
    if (!cleaned) return "Idle";

    /* ----------------------------------------------------
     * 3) 入力がある → Dialogueへ
     * ---------------------------------------------------- */
    return "Dialogue";
  }
}
