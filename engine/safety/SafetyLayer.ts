// /engine/safety/SafetyLayer.ts
import { TraitVector } from "@/lib/traits";

/** Safetyの挙動を調整する閾値群 */
export interface SafetyConfig {
  /** 各traitの最小/最大（最終的な境界） */
  bounds: { min: number; max: number };
  /** 1サイクルで許容する最大変化量（絶対値） */
  maxDelta: number;
  /** 平滑化（EMA）の係数 0〜1（小さいほど重く平滑） */
  emaAlpha: number;
  /** 過負荷判定の合計しきい値（高すぎ/低すぎ） */
  overloadHigh: number; // 例: 2.6
  overloadLow: number; // 例: 0.8
}

/** Safety判定結果 */
export interface SafetyReport {
  level: "ok" | "notice" | "limit";
  warnings: string[];
}

/** Advanced SafetyLayer */
export class SafetyLayer {
  /** 既定値（必要ならプロジェクト全体で1箇所上書きする） */
  static DEFAULT: SafetyConfig = {
    bounds: { min: 0, max: 1 },
    maxDelta: 0.2, // 1ステップで±0.2以上は抑制
    emaAlpha: 0.4, // 前回値寄りに0.6、今回値に0.4の重み
    overloadHigh: 2.6, // calm+empathy+curiosity がこれ超えたら高負荷
    overloadLow: 0.8, // これ未満なら低活性
  };

  /** 値を境界にクリップ */
  static clamp(x: number, min = 0, max = 1): number {
    if (!Number.isFinite(x)) return min;
    return Math.min(max, Math.max(min, x));
  }

  /** 0..1に正規化（NaN/未定義耐性） */
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

  /** 変化量を±maxDeltaに制限（前回→今回） */
  static limitDelta(
    prev: TraitVector,
    next: TraitVector,
    cfg: SafetyConfig = this.DEFAULT
  ): TraitVector {
    const cap = (p: number, n: number) => {
      const d = this.clamp(n - p, -cfg.maxDelta, cfg.maxDelta);
      return this.clamp(p + d, cfg.bounds.min, cfg.bounds.max);
    };
    return {
      calm: cap(prev.calm, next.calm),
      empathy: cap(prev.empathy, next.empathy),
      curiosity: cap(prev.curiosity, next.curiosity),
    };
  }

  /** 指数移動平均（EMA）でスムージング */
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

  /** 総和で過負荷/低活性をチェック（メッセージは日本語） */
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

  /**
   * 後方互換用：単体トレイトを平均に寄せて緩和
   * 既存コード互換のため残すが、基本は composite() を推奨
   */
  static stabilize(traits: TraitVector): TraitVector {
    const avg = (traits.calm + traits.empathy + traits.curiosity) / 3;
    return {
      calm: (traits.calm + avg) / 2,
      empathy: (traits.empathy + avg) / 2,
      curiosity: (traits.curiosity + avg) / 2,
    };
  }

  /**
   * 上位API：前回→候補→安全化 の一括処理
   * 1) 正規化 → 2) 変化制限 → 3) スムージング → 4) 最終正規化
   * 戻り値：stabilized（安全化後）、report（注意/制限レベル）
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

    const warn = this.checkOverload(finalTraits, cfg);
    const report: SafetyReport = {
      level: warn ? (warn.includes("過剰") ? "limit" : "notice") : "ok",
      warnings: warn ? [warn] : [],
    };

    return { stabilized: finalTraits, report };
  }

  /**
   * 簡易テキストガード（最小限のNGワードを＊で伏字）
   * 本格ガードはPhase 06後半/Phase 06.5で別途導入を想定
   */
  static guardText(text: string): { sanitized: string; flagged: boolean } {
    if (!text) return { sanitized: "", flagged: false };
    const BAD = [
      // 軽めのNG例（プロジェクト基準に合わせて拡張/調整）
      /(?<![a-z])damn(?![a-z])/gi,
      /(?<![a-z])shit(?![a-z])/gi,
    ];
    let flagged = false;
    let out = text;
    for (const re of BAD) {
      if (re.test(out)) flagged = true;
      out = out.replace(re, "＊");
    }
    return { sanitized: out, flagged };
  }
}
