// /engine/state/states/OverloadPreventState.ts
import { StateContext, SigmarisState } from "../StateContext";

export class OverloadPreventState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    /* ---------------------------------------------
     * 0) Emotion フォールバック
     * --------------------------------------------- */
    ctx.emotion = ctx.emotion ?? {
      tension: 0.2,
      warmth: 0.4,
      hesitation: 0.2,
    };

    /* ---------------------------------------------
     * 1) オーバーロード抑制メッセージ
     * --------------------------------------------- */
    ctx.output =
      "（負荷調整モード）\nちょっと処理を落としてるよ。軽めに話しながら整えていくね。";

    /* ---------------------------------------------
     * 2) Traits（性格ベクトル）の回復
     * --------------------------------------------- */
    ctx.traits = {
      calm: Math.min(1, ctx.traits.calm + 0.05), // 冷静さ回復
      empathy: Math.min(1, ctx.traits.empathy + 0.01), // 少しだけ共感力上昇
      curiosity: Math.max(0, ctx.traits.curiosity - 0.02), // 過剰探索 → 抑制
    };

    /* ---------------------------------------------
     * 3) Emotion（短期感情）の調整
     * --------------------------------------------- */
    ctx.emotion = {
      tension: Math.max(0, ctx.emotion.tension * 0.5), // 緊張が半減
      warmth: Math.max(0, ctx.emotion.warmth * 0.95), // 温かさは少し沈静
      hesitation: Math.min(1, ctx.emotion.hesitation + 0.05), // 迷いは少し増える
    };

    /* ---------------------------------------------
     * 4) 回復判定 → Dialogue に戻す
     * calm が 0.45 を超えれば「安全ライン」
     * --------------------------------------------- */
    if (ctx.traits.calm > 0.45) {
      return "Dialogue";
    }

    /* ---------------------------------------------
     * 5) 無限ループ防止（安全ガード）
     *    reflectCount を利用して 5 回以上続いたら強制解除
     * --------------------------------------------- */
    if (ctx.reflectCount > 5) {
      ctx.reflectCount = 0;
      return "Dialogue";
    }

    /* ---------------------------------------------
     * 6) 継続
     * --------------------------------------------- */
    ctx.reflectCount++;
    return "OverloadPrevent";
  }
}
