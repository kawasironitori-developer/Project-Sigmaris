// /engine/state/StateContext.ts
import { Trait } from "@/types/trait";
import { SafetyReport } from "@/types/safety";

export type SigmarisState =
  | "Idle"
  | "Dialogue"
  | "Reflect"
  | "Introspect"
  | "OverloadPrevent"
  | "SafetyMode";

export interface EmotionState {
  tension: number;
  warmth: number;
  hesitation: number;
}

export interface StateContext {
  input: string;
  output: string;

  currentState: SigmarisState;
  previousState: SigmarisState | null;

  traits: Trait;
  emotion: EmotionState;

  reflectCount: number;
  tokenUsage: number;

  safety: SafetyReport | null;

  timestamp: number;

  sessionId: string; // ← ← ★ 追加（重要）

  meta: Record<string, any>;
}

export function createInitialContext(): StateContext {
  return {
    input: "",
    output: "",

    currentState: "Idle",
    previousState: null,

    traits: {
      calm: 0.5,
      empathy: 0.5,
      curiosity: 0.5,
    },

    emotion: {
      tension: 0.1,
      warmth: 0.2,
      hesitation: 0.1,
    },

    reflectCount: 0,
    tokenUsage: 0,

    safety: null,
    timestamp: Date.now(),

    sessionId: "", // ← 初期値を用意（あとで上書き）

    meta: {},
  };
}
