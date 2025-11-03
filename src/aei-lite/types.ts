export type Role = "user" | "assistant" | "system";

export interface AEIInput {
  text: string;
  meta?: {
    role?: Role;
    timestamp?: number;
    tags?: string[];
  };
}

export interface AEIOutput {
  output: string;
  tokens?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  safety: {
    flagged: boolean;
    reasons: string[];
  };
  memoryRef?: {
    wrote: boolean;
    path?: string;
  };
  growth?: {
    updated: boolean;
    weight?: number;
  };
}

export interface AEIConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  memoryPath: string; // e.g. "./data/memory.json"
  growthPath: string; // e.g. "./data/growth.json"
  safeMode: "soft" | "hard"; // "hard"は厳しめフィルタ
}

export interface MemoryRecord {
  ts: number;
  in: string;
  out: string;
  meta?: Record<string, unknown>;
}
