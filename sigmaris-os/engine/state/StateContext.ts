// /engine/state/StateContext.ts
import { TraitVector } from "@/lib/traits";
import { SafetyReport } from "@/types/safety";

/* ---------------------------------------------
 * Self-Referent Module 用の情報
 * --------------------------------------------- */
export interface SelfReferentInfo {
  /** 今回の発話が「誰について語られているか」 */
  target: "self" | "ai" | "user" | "third" | "unknown";

  /** 自己参照性の強度（0.0〜1.0） */
  confidence: number;

  /** 検知した根拠（トークン/語彙/構文） */
  cues: string[];

  /** モジュール内部での補足理由（必ず存在） */
  note: string;
}

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
 * StateContext（ステートマシン共通データ）
 * --------------------------------------------- */
export interface StateContext {
  /** 入力テキスト */
  input: string;

  /** DialogueState が出した応答 */
  output: string;

  /** 現在のステート */
  currentState: SigmarisState;

  /** ひとつ前のステート */
  previousState: SigmarisState | null;

  /** Trait（AI人格の性質ベクトル） */
  traits: TraitVector;

  /** Emotion（短期揺らぎ） */
  emotion?: EmotionState;

  /** 内省回数（Reflect / Introspect で使用） */
  reflectCount: number;

  /** API / LLM 使用トークン */
  tokenUsage: number;

  /** Safety 層の最新レポート */
  safety?: SafetyReport;

  /** ステート遷移時間（ミリ秒） */
  timestamp: number;

  /** sessionId（route.ts にて割当） */
  sessionId: string;

  /** 旧会話要約（Meta層が利用） */
  summary: string | null;

  /** 直近会話ログ（Next.js → Nodeルートから受取） */
  recent: any[] | null;

  /** Python AEI-Core 側 Identity Snapshot */
  identitySnapshot?: any;

  /** Python AEI-Core の直接レスポンス */
  python?: Record<string, any>;

  /** 各ステート内部メタ情報 */
  meta: Record<string, any>;

  /** Self-Referent Module（自己参照推論）結果 */
  self_ref: SelfReferentInfo | null;
}

/* ---------------------------------------------
 * 初期化コンテキスト（Sigmaris OS 統一仕様）
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

    summary: null,
    recent: null,

    identitySnapshot: undefined,
    python: undefined,

    meta: {},

    /** Self-Referent 初期値 */
    self_ref: null,
  };
}
