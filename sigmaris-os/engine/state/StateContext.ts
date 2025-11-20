// /engine/state/StateContext.ts
import { TraitVector } from "@/lib/traits";
import { SafetyReport } from "@/types/safety";

export type SigmarisState =
  | "Idle"
  | "Dialogue"
  | "Reflect"
  | "Introspect"
  | "OverloadPrevent"
  | "SafetyMode";

/* ---------------------------------------------
 * Emotion (短期的感情状態)
 * --------------------------------------------- */
export interface EmotionState {
  tension: number;
  warmth: number;
  hesitation: number;
}

/* ---------------------------------------------
 * StateContext（全ステート間で共有される中核データ）
 * --------------------------------------------- */
export interface StateContext {
  input: string;
  output: string;

  currentState: SigmarisState;
  previousState: SigmarisState | null;

  /** Trait はプロジェクト標準の TraitVector に統一 */
  traits: TraitVector;

  /** Emotion は optional → State で安全フォールバック */
  emotion?: EmotionState;

  reflectCount: number;
  tokenUsage: number;

  /** SafetyReport は optional */
  safety?: SafetyReport;

  timestamp: number;

  /** route.ts が付与する session ID */
  sessionId: string;

  /** 任意のメタ情報（StateMachine 内部で利用） */
  meta: Record<string, any>;
}

/* ---------------------------------------------
 * 初期化コンテキスト
 * --------------------------------------------- */
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

    safety: undefined,

    timestamp: Date.now(),

    sessionId: "",

    meta: {},
  };
}
