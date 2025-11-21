// /engine/state/StateContext.ts
import { TraitVector } from "@/lib/traits";
import { SafetyReport } from "@/types/safety";

/* ---------------------------------------------
 * State 種類
 * --------------------------------------------- */
export type SigmarisState =
  | "Idle"
  | "Dialogue"
  | "Reflect"
  | "Introspect"
  | "OverloadPrevent"
  | "SafetyMode";

/* ---------------------------------------------
 * Emotion（短期感情）
 * --------------------------------------------- */
export interface EmotionState {
  tension: number;
  warmth: number;
  hesitation: number;
}

/* ---------------------------------------------
 * StateContext（全ステート共通の中核データ）
 * --------------------------------------------- */
export interface StateContext {
  input: string;
  output: string;

  currentState: SigmarisState;
  previousState: SigmarisState | null;

  /** Trait（Sigmaris-Persona 標準仕様） */
  traits: TraitVector;

  /** Emotion（optional） */
  emotion?: EmotionState;

  /** Reflect / Dialogue の回数等 */
  reflectCount: number;
  tokenUsage: number;

  /** Safety Report（optional） */
  safety?: SafetyReport;

  /** ループ時間 */
  timestamp: number;

  /** session ID（route.ts で付与） */
  sessionId: string;

  /** route.ts → StateMachine に渡す “古い履歴要約” */
  summary: string | null;

  /** 直近の会話（useSigmarisChat → route.ts） */
  recent: any[] | null;

  /** Python AEI-Core 側の Identity Snapshot（optional） */
  identitySnapshot?: any;

  /** Python AEI-Core のレスポンスをそのまま格納 */
  python?: Record<string, any>;

  /** その他 StateMachine 内部用メタ情報 */
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

    /** 追加（B仕様） */
    summary: null,
    recent: null,

    identitySnapshot: undefined,
    python: undefined,

    meta: {},
  };
}
