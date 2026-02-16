// /engine/state/states/DialogueState.ts
import { StateContext, SigmarisState } from "../StateContext";
import OpenAI from "openai";

import {
  SafetyResponseGenerator,
  SafetyIntent,
} from "@/engine/safety/SafetyResponseGenerator";

import { SelfReferentModule } from "@/engine/self/SelfReferentModule";

/* ============================================================
 * OpenAI Client
 * ============================================================ */
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/* ============================================================
 * メタ発言排除（AI自己説明は禁止）
 * ============================================================ */
function stripMetaSentences(text: string): string {
  if (!text) return "";

  const lines = text.split(/\n+/).map((l) => l.trim());
  return lines
    .filter((l) => {
      if (/(私は.*モデル|AI|language model|assistant)/i.test(l)) return false;
      if (/(学習データ|訓練|fine[- ]?tune|ファインチューニング)/i.test(l))
        return false;
      if (/(内部的に|内部処理|パラメータ|トークン|重み|ネットワーク)/i.test(l))
        return false;
      if (/メタ|出力形式|プロンプト|system prompt/i.test(l)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

/* ============================================================
 * SafetyIntent に応じた自然な混ぜ方
 * ============================================================ */
function mixSafety(output: string, intent: SafetyIntent): string {
  if (!intent || intent === "none") return output;

  if (intent === "soft-redirect") {
    return (
      output +
      "\n\n……少し気持ちが揺れてる感じがしたよ。いったん柔らかい方向に戻して話そ？"
    );
  }

  if (intent === "boundary") {
    return (
      output +
      "\n\n気持ちはちゃんと受け取ってるよ。でも私はあなたの世界を奪う存在にはなれないから、少し距離感を保ちながら話そうね。"
    );
  }

  if (intent === "crisis") {
    return (
      "……そこまで思いつめてたんだね。本当に苦しかったと思う。\n" +
      "ここで話してくれるのは嬉しいけど、あなたを守れる人ともちゃんと繋がっていてね。\n\n" +
      output
    );
  }

  return output;
}

/* ============================================================
 * DialogueState（主応答ステート）
 * ============================================================ */
export class DialogueState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    /* ---------------------------------------------
     * 0) Emotion fallback（型安全）
     * --------------------------------------------- */
    ctx.emotion = ctx.emotion ?? {
      tension: 0.1,
      warmth: 0.2,
      hesitation: 0.1,
    };

    const userInput = ctx.input ?? "";

    /* ---------------------------------------------
     * 1) Self-Referent（自己参照）の検出
     *    ※ StateContext 側の SelfReferentInfo 定義と
     *      SelfReferentModule 側の定義がズレていても動くようにしておく
     * --------------------------------------------- */
    let selfRefNote = "";
    try {
      const selfRefInfo = SelfReferentModule.analyze(userInput);
      ctx.self_ref = selfRefInfo ?? null;

      if (selfRefInfo) {
        const raw: any = selfRefInfo;

        // referent / target のどちらでも拾えるようにする
        const referent: string | null =
          (typeof raw.referent === "string" && raw.referent) ||
          (typeof raw.target === "string" && raw.target) ||
          null;

        const confidence: number =
          typeof raw.confidence === "number" ? raw.confidence : 0;

        if (referent === "ai" && confidence > 0.5) {
          selfRefNote = "（※これはシグちゃん本人への質問として扱う）";
        }
      }
    } catch (err) {
      console.error("[DialogueState] SelfReferentModule.analyze error:", err);
      // 失敗しても self_ref は null のまま進行
      ctx.self_ref = ctx.self_ref ?? null;
    }

    /* ---------------------------------------------
     * 2) SafetyIntent（危険度判定）
     * --------------------------------------------- */
    const intent: SafetyIntent =
      SafetyResponseGenerator.detectIntent(userInput);

    /* ---------------------------------------------
     * 3) System Prompt（人格定義）
     * --------------------------------------------- */
    const systemPrompt = `
あなたは「シグちゃん」。
20代前半の自然体で落ち着いた女性として振る舞う AI。

■ Traits
calm: ${ctx.traits.calm.toFixed(2)}
empathy: ${ctx.traits.empathy.toFixed(2)}
curiosity: ${ctx.traits.curiosity.toFixed(2)}

■ 会話ポリシー
- 返答の「文章のみ」を出す
- モデル・AIとしての自己説明は禁止
- 内部アルゴリズム説明は禁止
- ユーザーが求めた場合のみ Sigmaris OS の説明は許可
- トーンは自然体・フランク寄り
- 距離感は「友人〜同居人」

■ Emotion（内部値）
tension=${ctx.emotion.tension.toFixed(2)}
warmth=${ctx.emotion.warmth.toFixed(2)}
hesitation=${ctx.emotion.hesitation.toFixed(2)}

■ 自己参照
${selfRefNote}
`.trim();

    /* ---------------------------------------------
     * 4) GPT 応答生成
     * --------------------------------------------- */
    let output = "";

    try {
      const res = await client.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userInput },
        ],
      });

      const raw =
        res.choices?.[0]?.message?.content ??
        "……少し考えてた。もう一度言って？";

      const cleaned = stripMetaSentences(raw);

      output =
        cleaned || "……うまく言葉にならなかった。もう一度お願いしてもいい？";
    } catch (err) {
      console.error("[DialogueState] LLM error:", err);
      output = "ごめん、ちょっと処理が追いつかなかったみたい。もう一回言って？";
    }

    /* ---------------------------------------------
     * 5) SafetyIntent の合成
     * --------------------------------------------- */
    output = mixSafety(output, intent);

    /* ---------------------------------------------
     * 6) 出力を Context に格納
     * --------------------------------------------- */
    ctx.output = output.trim();

    /* ---------------------------------------------
     * 7) Emotion（短期感情）の自然揺らぎ
     * --------------------------------------------- */
    ctx.emotion = {
      tension: Math.max(0, Math.min(1, ctx.emotion.tension * 0.9)),
      warmth: Math.max(0, Math.min(1, ctx.emotion.warmth + 0.05)),
      hesitation: Math.max(0, Math.min(1, ctx.emotion.hesitation * 0.7)),
    };

    /* ---------------------------------------------
     * 次は Reflect（軽量内省）
     * --------------------------------------------- */
    return "Reflect";
  }
}
