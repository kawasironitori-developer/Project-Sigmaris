// /engine/safety/SafetyReport.ts

export interface SafetyFlags {
  selfReference: boolean; // AI が自分自身の状態に過剰言及してないか
  abstractionOverload: boolean; // 抽象化しすぎによる誤作動
  loopSuspect: boolean; // 応答がループの兆候を示すか
}

export interface SafetyReport {
  flags: SafetyFlags;

  // next-action 指示（UI や StateMachine で使用される）
  action: "allow" | "rewrite-soft" | "halt";

  // 補助的なテキスト（UI のみ使用）
  note?: string;

  // シグちゃんの動作モード
  suggestMode?: "calm-down" | "normal" | "review";
}
