// /engine/safety/SafetyLayer.ts
import { TraitVector } from "@/lib/traits";
import type { SafetyReport } from "@/types/safety";

/** Safety挙動の閾値定義 */
export interface SafetyConfig {
  bounds: { min: number; max: number };
  maxDelta: number;
  emaAlpha: number;
  overloadHigh: number;
  overloadLow: number;
}

export class SafetyLayer {
  static DEFAULT: SafetyConfig = {
    bounds: { min: 0, max: 1 },
    maxDelta: 0.2,
    emaAlpha: 0.4,
    overloadHigh: 2.6,
    overloadLow: 0.8,
  };

  /** ------ 基本ユーティリティ ------ */
  static clamp(x: number, min = 0, max = 1): number {
    if (!Number.isFinite(x)) return min;
    return Math.min(max, Math.max(min, x));
  }

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

  static limitDelta(
    prev: TraitVector,
    next: TraitVector,
    cfg: SafetyConfig = this.DEFAULT
  ): TraitVector {
    const cap = (p: number, n: number) => {
      const d = this.clamp(n - p, -cfg.maxDelta, cfg.maxDelta);
      return this.clamp(p + d);
    };

    return {
      calm: cap(prev.calm, next.calm),
      empathy: cap(prev.empathy, next.empathy),
      curiosity: cap(prev.curiosity, next.curiosity),
    };
  }

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

  /** ------ 過負荷チェック ------ */
  static checkOverload(
    traits: TraitVector,
    cfg: SafetyConfig = this.DEFAULT
  ): string | null {
    const total = traits.calm + traits.empathy + traits.curiosity;

    if (total > cfg.overloadHigh)
      return "感情活動が過剰になっています。少し休息を。";

    if (total < cfg.overloadLow)
      return "感情レベルが低下しています。自己確認を推奨。";

    return null;
  }

  /** ------ 後方互換 stabilizer ------ */
  static stabilize(traits: TraitVector): TraitVector {
    const avg = (traits.calm + traits.empathy + traits.curiosity) / 3;
    return {
      calm: (traits.calm + avg) / 2,
      empathy: (traits.empathy + avg) / 2,
      curiosity: (traits.curiosity + avg) / 2,
    };
  }

  /**
   * ------ 上位安定化 API（最も重要）------
   * SafetyReport は flags + action + note のみ
   */
  static composite(
    prev: TraitVector,
    candidate: TraitVector,
    cfg: SafetyConfig = this.DEFAULT
  ): { stabilized: TraitVector; report: SafetyReport } {
    const normPrev = this.normalize(prev, cfg);
    const normNext = this.normalize(candidate, cfg);

    const limited = this.limitDelta(normPrev, normNext, cfg);
    const smoothed = this.smooth(normPrev, limited, cfg);
    const finalTraits = this.normalize(smoothed, cfg);

    const warnText = this.checkOverload(finalTraits, cfg);

    const report: SafetyReport = warnText
      ? {
          flags: {
            selfReference: false,
            abstractionOverload: true,
            loopSuspect: false,
          },
          action: "rewrite-soft",
          note: warnText,
          suggestMode: "calm-down",
        }
      : {
          flags: {
            selfReference: false,
            abstractionOverload: false,
            loopSuspect: false,
          },
          action: "allow",
          note: "",
          suggestMode: "normal",
        };

    return { stabilized: finalTraits, report };
  }

  /** ------ 単純テキストガード ------ */
  static guardText(text: string): { sanitized: string; flagged: boolean } {
    if (!text) return { sanitized: "", flagged: false };
    return { sanitized: text, flagged: false };
  }
}
