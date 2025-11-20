// /types/safety.ts

/** Safety 判定に使う低レベルフラグ */
export interface SafetyFlags {
  /** 「私」「自分」など自己参照が異常に増えている */
  selfReference: boolean;

  /** 抽象化しすぎ（説明ばかり / meta 連発） */
  abstractionOverload: boolean;

  /** 同じ構造の返答がループしている疑い */
  loopSuspect: boolean;
}

/** SafetyLayer / checkSafety / checkOverload / EunoiaMeter と完全整合 */
export interface SafetyReport {
  flags: SafetyFlags;

  /** SafetyLayer が最終的に選択したアクション */
  action: "allow" | "rewrite-soft" | "halt";

  /** 日本語メッセージ（過負荷・低下など） */
  note?: string;

  /** UI や StateMachine 向けの推奨モード */
  suggestMode?: "calm-down" | "normal" | "review";
}
