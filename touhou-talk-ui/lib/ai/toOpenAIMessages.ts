// lib/ai/toOpenAIMessages.ts

import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

/* =========================
   UI 側の Message 型
   （ChatPane.tsx で使っている形）
========================= */
export type UIMessage = {
  role: "user" | "ai";
  content: string;
};

/* =========================
   役割
   UIメッセージ → OpenAIメッセージ変換

   - UI:  "ai"
   - OpenAI: "assistant"

   👉 ここで吸収することで
      UI側は OpenAI SDK を一切知らなくて済む
========================= */
export function toOpenAIMessages(
  messages: UIMessage[]
): ChatCompletionMessageParam[] {
  return messages.map((msg) => {
    // UI → OpenAI の role 変換
    const role = msg.role === "ai" ? "assistant" : "user";

    return {
      role,
      content: msg.content,
    };
  });
}
