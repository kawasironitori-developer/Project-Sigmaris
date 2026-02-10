// /lib/ai/chat.ts

/**
 * このファイルの役割
 * ------------------
 * UI や API Route から渡された情報をもとに
 * OpenAI GPT-5.2 を呼び出し、キャラらしい返答を返す。
 *
 * 重要：
 * - 人格定義は buildPrompt.ts に完全委譲
 * - ここでは「会話の橋渡し」しかしない
 * - 状態管理・記憶・世界観改変はしない
 */

import OpenAI from "openai";
import { buildPrompt } from "./buildPrompt";
import { toOpenAIMessages } from "./toOpenAIMessages";

/* =========================
   型定義
========================= */

/**
 * UI から渡ってくる 1 メッセージ
 */
export type ChatMessage = {
  role: "user" | "ai";
  content: string;
};

/**
 * キャラクター定義（prompt 用）
 * ※ UI 情報は含めない
 */
export type CharacterForChat = {
  id: string;
  name: string;
  title: string;
  system: {
    world: string;
    selfRecognition: string;
  };
  prompt: {
    persona: string[];
    speech: string[];
    constraints: string[];
  };
};

/* =========================
   OpenAI Client
========================= */

/**
 * OpenAI クライアントを初期化
 * - API Key は .env から読む
 * - ここ以外で new OpenAI() しない
 */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =========================
   メイン関数
========================= */

/**
 * キャラクターと会話履歴を受け取り、
 * GPT-5.2 から次の返答を 1 件だけ取得する
 */
export async function chatWithCharacter(
  character: CharacterForChat,
  messages: ChatMessage[]
): Promise<string> {
  /**
   * ① キャラクター人格プロンプトを構築
   */
  const { system, developer } = buildPrompt(character);

  /**
   * ② GPT に渡す messages を構築
   *
   * role の使い分け：
   * - system    : 世界観・存在定義（最上位）
   * - developer : 性格・話し方・制約
   * - user      : ユーザー発言
   * - assistant : AI（キャラ）の過去発言
   */
  const gptMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: system,
    },
    {
      role: "developer",
      content: developer,
    },
    // 👇 UIメッセージは変換レイヤーに完全委譲
    ...toOpenAIMessages(messages),
  ];

  /**
   * ③ OpenAI API 呼び出し
   *
   * ポイント：
   * - model は固定で gpt-5.2
   * - temperature は「キャラ演技向け」にやや高め
   * - max_tokens は暴走防止のため制限
   */
  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: gptMessages,

    // キャラ演技の揺らぎ用
    temperature: 0.85,

    // gpt-5.x 系では max_tokens ではなくこちら
    max_completion_tokens: 500,
  });

  /**
   * ④ 応答の取り出し
   *
   * 万が一空でも UI を壊さないよう保険をかける
   */
  const reply = completion.choices[0]?.message?.content;

  if (!reply) {
    return "……少し考え込んでしまったわ。もう一度言って。";
  }

  return reply;
}
