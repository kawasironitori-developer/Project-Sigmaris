export interface SafetyFlags {
  selfReference: boolean;
  abstractionOverload: boolean;
  loopSuspect: boolean;
}

export interface SafetyReport {
  flags: SafetyFlags;
  action: "allow" | "rewrite-soft" | "halt";
  note?: string;
  suggestMode?: "calm-down" | "normal" | "review";
}
