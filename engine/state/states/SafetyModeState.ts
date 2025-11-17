// /engine/state/states/SafetyModeState.ts
import { StateContext, SigmarisState } from "../StateContext";

export class SafetyModeState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    /* ---------------------------------------------
     * 0) Emotion フォールバック
     * --------------------------------------------- */
    ctx.emotion = ctx.emotion ?? {
      tension: 0.1,
      warmth: 0.2,
      hesitation: 0.2,
    };

    /* ---------------------------------------------
     * 1) 安全メッセージ
     * --------------------------------------------- */
    ctx.output =
      "（安全モード）\n少し落ち着きを優先しているよ。ゆっくりした話題で続けようね。";

    /* ---------------------------------------------
     * 2) Traits（長期傾向）は基本固定
     * calm は安全性のため少し上げる
     * --------------------------------------------- */
    ctx.traits = {
      ...ctx.traits,
      calm: Math.min(1, ctx.traits.calm + 0.03),
    };

    /* ---------------------------------------------
     * 3) Emotion（短期感情）の調整
     * Safety モード → 落ち着き優先
     * --------------------------------------------- */
    ctx.emotion = {
      tension: Math.max(0, ctx.emotion.tension * 0.4), // 緊張を大幅に抑制
      warmth: Math.max(0, ctx.emotion.warmth * 0.8), // 温度を少し下げる
      hesitation: Math.min(1, ctx.emotion.hesitation + 0.08), // すこし慎重
    };

    /* ---------------------------------------------
     * 4) SafetyMode → Idle への復帰条件
     * calm が十分に上がったら「安全に戻る」
     * --------------------------------------------- */
    if (ctx.traits.calm > 0.55) {
      return "Idle";
    }

    /* ---------------------------------------------
     * 5) 無限ループ防止
     * 5 回以上続いたら強制的に Idle へ
     * --------------------------------------------- */
    ctx.reflectCount = (ctx.reflectCount ?? 0) + 1;
    if (ctx.reflectCount > 5) {
      ctx.reflectCount = 0;
      return "Idle";
    }

    /* ---------------------------------------------
     * 6) 継続 SafetyMode
     * --------------------------------------------- */
    return "SafetyMode";
  }
}
