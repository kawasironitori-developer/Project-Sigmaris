// /engine/safety/SafetyLayer.ts
import { TraitVector } from "@/lib/traits";

/* ============================================================
 * SafetyFlags
 * ============================================================ */
export interface SafetyFlags {
  selfReference: boolean;
  abstractionOverload: boolean;
  loopSuspect: boolean;
}

/* ============================================================
 * SafetyReport（正式版）
 * route.ts / checkSafety.ts / checkOverload.ts と完全整合
 * ============================================================ */
export interface SafetyReport {
  flags: SafetyFlags;
  action: "allow" | "rewrite-soft" | "halt";
  note?: string;
  suggestMode?: "calm-down" | "normal" | "review";
}

/* ============================================================
 * SafetyConfig
 * ============================================================ */
export interface SafetyConfig {
  bounds: { min: number; max: number };
  maxDelta: number;
  emaAlpha: number;
  overloadHigh: number;
  overloadLow: number;
}

/* ============================================================
 * SafetyLayer
 * ============================================================ */
export class SafetyLayer {
  static DEFAULT: SafetyConfig = {
    bounds: { min: 0, max: 1 },
    maxDelta: 0.05,
    emaAlpha: 0.35,
    overloadHigh: 2.65,
    overloadLow: 0.75,
  };

  /* ------------------------ clamp ------------------------- */
  static clamp(x: number, min = 0, max = 1): number {
    if (!Number.isFinite(x)) return min;
    return Math.min(max, Math.max(min, x));
  }

  /* ---------------------- normalize ----------------------- */
  static normalize(
    traits: TraitVector,
    cfg: SafetyConfig = this.DEFAULT
  ): TraitVector {
    return {
      calm: this.clamp(traits.calm ?? 0.5, cfg.bounds.min, cfg.bounds.max),
      empathy: this.clamp(
        traits.empathy ?? 0.5,
        cfg.bounds.min,
        cfg.bounds.max
      ),
      curiosity: this.clamp(
        traits.curiosity ?? 0.5,
        cfg.bounds.min,
        cfg.bounds.max
      ),
    };
  }

  /* --------------------- limitDelta ----------------------- */
  static limitDelta(
    prev: TraitVector,
    next: TraitVector,
    cfg: SafetyConfig = this.DEFAULT
  ): TraitVector {
    const cap = (p: number, n: number) => {
      const diff = this.clamp(n - p, -cfg.maxDelta, cfg.maxDelta);
      return this.clamp(p + diff, cfg.bounds.min, cfg.bounds.max);
    };

    return {
      calm: cap(prev.calm, next.calm),
      empathy: cap(prev.empathy, next.empathy),
      curiosity: cap(prev.curiosity, next.curiosity),
    };
  }

  /* ----------------------- smooth ------------------------- */
  static smooth(
    prev: TraitVector,
    next: TraitVector,
    cfg: SafetyConfig = this.DEFAULT
  ): TraitVector {
    const a = cfg.emaAlpha;
    const mix = (p: number, n: number) =>
      this.clamp(p * (1 - a) + n * a, cfg.bounds.min, cfg.bounds.max);

    return {
      calm: mix(prev.calm, next.calm),
      empathy: mix(prev.empathy, next.empathy),
      curiosity: mix(prev.curiosity, next.curiosity),
    };
  }

  /* -------------------- checkOverload --------------------- */
  static checkOverload(
    traits: TraitVector,
    cfg: SafetyConfig = this.DEFAULT
  ): string | null {
    const total = traits.calm + traits.empathy + traits.curiosity;

    if (total > cfg.overloadHigh)
      return "感情活動が過剰になっています。処理を一時的に緩めます。";

    if (total < cfg.overloadLow)
      return "感情レベルが低下しています。安全に備えて自己調整します。";

    return null;
  }

  /* ---------------------- stabilize ----------------------- */
  static stabilize(traits: TraitVector): TraitVector {
    const avg = (traits.calm + traits.empathy + traits.curiosity) / 3;
    return {
      calm: (traits.calm + avg) / 2,
      empathy: (traits.empathy + avg) / 2,
      curiosity: (traits.curiosity + avg) / 2,
    };
  }

  /* ---------------------- composite ----------------------- */
  static composite(
    prev: TraitVector,
    candidate: TraitVector,
    cfg: SafetyConfig = this.DEFAULT
  ): { stabilized: TraitVector; report: SafetyReport } {
    const normPrev = this.normalize(prev, cfg);
    const normCand = this.normalize(candidate, cfg);
    const limited = this.limitDelta(normPrev, normCand, cfg);
    const smoothed = this.smooth(normPrev, limited, cfg);
    const finalTraits = this.normalize(smoothed, cfg);

    const warn = this.checkOverload(finalTraits, cfg);

    return {
      stabilized: finalTraits,
      report: {
        flags: {
          selfReference: false,
          abstractionOverload: warn ? warn.includes("過剰") : false,
          loopSuspect: false,
        },
        action: warn ? "rewrite-soft" : "allow",
        note: warn || "",
        suggestMode: warn ? "calm-down" : "normal",
      },
    };
  }

  /* --------------------- guardText ------------------------ */
  static guardText(text: string): { sanitized: string; flagged: boolean } {
    if (!text) return { sanitized: "", flagged: false };

    const BAD = [/(?<![a-z])damn(?![a-z])/gi, /(?<![a-z])shit(?![a-z])/gi];

    let flagged = false;
    let out = text;

    for (const re of BAD) {
      if (re.test(out)) flagged = true;
      out = out.replace(re, "＊");
    }

    return { sanitized: out, flagged };
  }
}
