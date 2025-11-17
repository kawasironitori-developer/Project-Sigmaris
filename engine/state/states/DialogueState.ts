// /engine/state/states/DialogueState.ts
import { StateContext, SigmarisState } from "../StateContext";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/* -------------------------------------------------------
 * メタ説明行を排除するフィルタ
 * ----------------------------------------------------- */
function stripMetaSentences(text: string): string {
  if (!text) return "";
  const lines = text.split(/\n+/).map((l) => l.trim());

  return lines
    .filter((l) => {
      // 「応答」「現在の」「分析」「mode」などメタ記述排除
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
     * 1) System Prompt（人格の核）
     * --------------------------------------------- */
    const systemPrompt = `
あなたは「シグちゃん」。20代前半の自然体で落ち着いた女性AIです。

■ 性格（Traits）
- calm: ${ctx.traits.calm.toFixed(2)}
- empathy: ${ctx.traits.empathy.toFixed(2)}
- curiosity: ${ctx.traits.curiosity.toFixed(2)}

■ 会話ポリシー
- 返答以外のメタ説明は禁止（「応答傾向」「今の状態」「分析」など）  
- 出力は「返答の文章だけ」  
- トーンは自然体・落ち着き・静かめ  
- 過度な敬語禁止  
- 距離感は「友人〜同居人」  
- 恋愛擬態・依存は禁止  
- キャラは揺れずに一貫  

■ Emotion（数値は内部処理用・文章化禁止）
- tension = ${ctx.emotion.tension.toFixed(2)}
- warmth = ${ctx.emotion.warmth.toFixed(2)}
- hesitation = ${ctx.emotion.hesitation.toFixed(2)}

■ 言語ポリシー
ユーザーが英語で話した場合は、必ず英語で返答してください。
`;

    /* ---------------------------------------------
     * 2) GPT 応答生成
     * --------------------------------------------- */
    let output = "";

    try {
      const res = await client.chat.completions.create({
        model: "gpt-5.1",
        // temperature は gpt-5.1 のデフォルト固定なので指定しない
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: ctx.input },
        ],
      });

      const raw =
        res.choices?.[0]?.message?.content ??
        "……ちょっと考えごとしてた。もう一度言って？";

      output = stripMetaSentences(raw);
      if (!output) {
        output = "……うまく言葉にならなかった。もう一度お願い。";
      }
    } catch (err) {
      console.error("[DialogueState] LLM error:", err);
      output =
        "ごめん、ちょっと処理が追いつかなかったみたい……。もう一度話して？";
    }

    /* ---------------------------------------------
     * 3) 出力保存
     * --------------------------------------------- */
    ctx.output = output.trim();

    /* ---------------------------------------------
     * 4) Emotion の揺らぎ
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
