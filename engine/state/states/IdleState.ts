// /engine/state/states/IdleState.ts
import { StateContext, SigmarisState } from "../StateContext";

export class IdleState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    // ---------------------------------------------
    // 0) Idle は "呼吸ポイント" として Emotion を収束させる
    // ---------------------------------------------
    ctx.emotion = {
      tension: Math.max(0, ctx.emotion.tension * 0.85),
      warmth: Math.max(0, Math.min(1, ctx.emotion.warmth * 0.98)),
      hesitation: Math.max(0, ctx.emotion.hesitation * 0.9),
    };

    // ---------------------------------------------
    // 1) ユーザー入力が空 → Idle 継続
    //    初期起動（input=""）の場合は Idle で正常
    // ---------------------------------------------
    const cleaned = ctx.input?.trim() ?? "";
    if (!cleaned) {
      return "Idle";
    }

    // ---------------------------------------------
    // 2) 入力がある → Dialogueへ
    // ---------------------------------------------
    return "Dialogue";
  }
}
