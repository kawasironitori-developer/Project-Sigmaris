import OpenAI from "openai";
import { AEIConfig, AEIInput } from "../types";

// Logic Core: GPT呼び出し（唯一の課金ポイント）
export class LogicCore {
  private client: OpenAI;
  private config: AEIConfig;

  constructor(cfg: AEIConfig) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.config = cfg;
  }

  async ask(
    input: AEIInput
  ): Promise<{
    text: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  }> {
    const sys = "You are Sigmaris Logic Core. Be concise, clear, and safe.";
    const messages = [
      { role: "system" as const, content: sys },
      { role: "user" as const, content: input.text },
    ];

    // SDKの互換性確保のため chat.completions を利用
    const res = await this.client.chat.completions.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      messages,
    });

    const text = res.choices?.[0]?.message?.content ?? "";
    const usage = res.usage ?? undefined;
    return { text, usage };
  }
}
