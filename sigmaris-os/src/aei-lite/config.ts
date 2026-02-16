import { AEIConfig } from "./types";

export const defaultConfig: AEIConfig = {
  model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
  maxTokens: Number(process.env.OPENAI_MAX_TOKENS ?? 800),
  temperature: Number(process.env.OPENAI_TEMPERATURE ?? 0.2),
  memoryPath: process.env.SIGMARIS_MEMORY_PATH ?? "./data/memory.json",
  growthPath: process.env.SIGMARIS_GROWTH_PATH ?? "./data/growth.json",
  safeMode: (process.env.SIGMARIS_SAFE_MODE as "soft" | "hard") ?? "soft",
};
