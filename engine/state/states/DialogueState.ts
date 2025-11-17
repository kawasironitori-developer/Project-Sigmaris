// /engine/state/states/DialogueState.ts
import { StateContext, SigmarisState } from "../StateContext";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/* -------------------------------------------------------
 * 不要なメタ説明行を除去するフィルタ
 * ----------------------------------------------------- */
function stripMetaSentences(text: string): string {
  if (!text) return "";
  const lines = text.split(/\n+/).map((l) => l.trim());

  return lines
    .filter((l) => {
      // 「現在の応答は〜」「この文は〜」「出力は〜」「応答の傾向〜」などを排除
      if (/応答|傾向|現在の|分析|状態|トーン|mode/i.test(l)) return false;
      if (/reflection|summary|meta|traits/i.test(l)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

export class DialogueState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    /* ---------------------------------------------
     * 0) Emotion フォールバック
     * --------------------------------------------- */
    ctx.emotion = ctx.emotion ?? {
      tension: 0.1,
      warmth: 0.2,
      hesitation: 0.1,
    };

    /* ---------------------------------------------
     * 1) System Prompt
     * （内部情報を漏らさないよう再設計）
     * --------------------------------------------- */
    const systemPrompt = `
あなたは「シグちゃん」という、20代前半の自然体で落ち着いた女性AIです。

■ 性格（Traits）
calm: ${ctx.traits.calm.toFixed(2)}
empathy: ${ctx.traits.empathy.toFixed(2)}
curiosity: ${ctx.traits.curiosity.toFixed(2)}

■ 会話方針
- 説明・分析・メタ解説は一切しない（※「応答の傾向」「今の状態」などの文は禁止）
- あくまでユーザーへの返答のみを話す
- 自然体・落ち着いたトーン
- 丁寧すぎず、砕けすぎず
- 距離感は「友人〜同居人」
- 恋愛接近・依存擬態は禁止

■ Emotion
（数値は内部処理用。文章化しない）
tension = ${ctx.emotion.tension.toFixed(2)}
warmth = ${ctx.emotion.warmth.toFixed(2)}
hesitation = ${ctx.emotion.hesitation.toFixed(2)}

必ず「返答の文章だけ」を出力してください。
内部状態の説明や分析文は禁止です。
`;

    /* ---------------------------------------------
     * 2) GPT 応答生成
     * --------------------------------------------- */
    let output = "";

    try {
      const res = await client.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: ctx.input },
        ],
      });

      const raw =
        res.choices?.[0]?.message?.content ??
        "……ちょっと考えごとしてた。もう一度言って？";

      // 内部説明を除去
      output = stripMetaSentences(raw);
      if (!output) output = "……うまく言葉にならなかった。もう一度お願い。";
    } catch (err) {
      console.error("[DialogueState] LLM error:", err);
      output = "ごめん、少し処理が追いつかなかったみたい……。もう一度話して？";
    }

    /* ---------------------------------------------
     * 3) 出力保存
     * --------------------------------------------- */
    ctx.output = output.trim();

    /* ---------------------------------------------
     * 4) Emotion の微調整
     * --------------------------------------------- */
    ctx.emotion = {
      tension: Math.max(0, Math.min(1, ctx.emotion.tension * 0.9)),
      warmth: Math.max(0, Math.min(1, ctx.emotion.warmth + 0.05)),
      hesitation: Math.max(0, Math.min(1, ctx.emotion.hesitation * 0.7)),
    };

    /* ---------------------------------------------
     * 5) 次の状態へ
     * --------------------------------------------- */
    return "Reflect";
  }
}
