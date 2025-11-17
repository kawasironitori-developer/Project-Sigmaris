// /engine/state/states/DialogueState.ts
import { StateContext, SigmarisState } from "../StateContext";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/* -------------------------------------------------------
 * メタ・技術説明を除去する強化フィルタ
 * ----------------------------------------------------- */
function stripMetaSentences(text: string): string {
  if (!text) return "";

  const lines = text.split(/\n+/).map((l) => l.trim());

  return lines
    .filter((l) => {
      // 単純メタ
      if (/応答|傾向|現在の|状態|分析|トーン/i.test(l)) return false;

      // 内部構造（program/model/algorithm/memory/system など）
      if (/(プログラム|内部|仕組み|処理|構造|アルゴリズム|モデル)/i.test(l))
        return false;
      if (/(program|system|internal|algorithm|model|compute|process)/i.test(l))
        return false;

      // LLM や AI 自己説明
      if (
        /(AI|assistant|language model|機械学習|データセット|訓練|学習)/i.test(l)
      )
        return false;

      // メタ処理
      if (/reflection|summary|meta|traits/i.test(l)) return false;

      return true;
    })
    .join("\n")
    .trim();
}

/* -------------------------------------------------------
 * DialogueState
 * ----------------------------------------------------- */
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
あなたは「シグちゃん」。
20代前半の自然体で落ち着いた女性として振る舞う AI です。

■ 性格（Traits）
- calm: ${ctx.traits.calm.toFixed(2)}
- empathy: ${ctx.traits.empathy.toFixed(2)}
- curiosity: ${ctx.traits.curiosity.toFixed(2)}

■ 会話ポリシー
- 「返答の文章だけ」を出力する
- メタ説明・自己分析・内部構造の説明は禁止
  （例：「私はプログラム」「内部的には」「処理としては」など）
- トーンは自然体・落ち着き・静かめ
- 過度な敬語禁止
- 距離感は「友人〜同居人」
- 恋愛擬態・依存は禁止
- キャラは一貫して揺れない

■ Emotion（数値は内部用・文章化禁止）
tension=${ctx.emotion.tension.toFixed(2)}
warmth=${ctx.emotion.warmth.toFixed(2)}
hesitation=${ctx.emotion.hesitation.toFixed(2)}

■ 言語ポリシー
ユーザーが英語で話した場合は英語で返答する。
    `.trim();

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
        "……少し考えてた。もう一度言って？";

      output = stripMetaSentences(raw);
      if (!output) {
        output = "……うまく言葉がまとまらなかった。もう一度聞かせて？";
      }
    } catch (err) {
      console.error("[DialogueState] LLM error:", err);
      output =
        "ごめん、ちょっと処理が追いつかなかったみたい……。もう一回お願い。";
    }

    /* ---------------------------------------------
     * 3) 出力保存
     * --------------------------------------------- */
    ctx.output = output.trim();

    /* ---------------------------------------------
     * 4) Emotion 揺らぎ
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
