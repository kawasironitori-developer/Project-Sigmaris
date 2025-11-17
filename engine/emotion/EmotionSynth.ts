// /engine/emotion/EmotionSynth.ts
import { TraitVector } from "@/lib/traits";

/**
 * EmotionProfile
 * - 長期性格（三属性）から推定される「語彙的な温度」
 * - StateContext.emotion（短期状態）とは独立させる
 */
interface EmotionProfile {
  tone: "neutral" | "warm" | "inquisitive" | "anxious" | "cold";
  intensity: number; // 0〜1：語尾・強弱をどの程度補正するか
  keywords: string[]; // 内部用（今後のテンション補正に利用）
}

/**
 * ============================================================
 * EmotionSynth v1 — Natural Output Mode
 * - 演出や装飾は行わず、文章破綻を起こさない範囲で
 *   “ニュアンス補正” のみを行う。
 * ============================================================
 */
export class EmotionSynth {
  /**
   * traits → EmotionProfile へ変換
   * （短期 Emotion とは独立した長期的キャラクタートーン）
   */
  static analyzeTraits(traits: TraitVector): EmotionProfile {
    const { calm, empathy, curiosity } = traits;

    // intensity: 落ち着き × 好奇 × 共感 の釣り合いで決定
    const rawIntensity = (1 - calm) * 0.5 + curiosity * 0.3 + empathy * 0.2;

    const intensity = Math.max(0.1, Math.min(1, rawIntensity));

    let tone: EmotionProfile["tone"] = "neutral";

    if (empathy > 0.7 && calm > 0.6) tone = "warm";
    else if (curiosity > 0.7) tone = "inquisitive";
    else if (calm < 0.35) tone = "anxious";
    else if (empathy < 0.35) tone = "cold";

    return {
      tone,
      intensity,
      keywords: this.keywordsByTone(tone),
    };
  }

  /** Toneごとの内部キーワード（今は使用しないが将来拡張用） */
  private static keywordsByTone(tone: EmotionProfile["tone"]): string[] {
    switch (tone) {
      case "warm":
        return ["soft", "gently", "kind"];
      case "inquisitive":
        return ["curiously", "thoughtful"];
      case "anxious":
        return ["hesitant", "fragile"];
      case "cold":
        return ["flat", "precise"];
      case "neutral":
      default:
        return ["calm", "steady"];
    }
  }

  /**
   * ============================================================
   * applyTone()
   * - 強すぎる句読点や！?の連打を抑制する
   * - EmotionState（tension・warmth…）とは独立した補正
   * - 「自然文として違和感がない」ことが最優先
   * ============================================================
   */
  static applyTone(text: string, traits: TraitVector): string {
    if (!text) return "";

    const profile = this.analyzeTraits(traits);
    let out = text;

    /**
     * 1) 強すぎる感嘆符を抑制
     * - intensity が弱い → 「!」を「。」に変換
     * - intensity が普通 → 「!!」以上のみ「。」へ
     */
    if (profile.intensity < 0.4) {
      out = out.replace(/!+/g, "。");
    } else {
      out = out.replace(/!!+/g, "。");
    }

    /**
     * 2) 「!?」系の暴走抑制
     * （自然な一文として保つ）
     */
    out = out.replace(/[！？]{2,}/g, "。");

    /**
     * 3) 行末の記号補正
     * （「!」「?」単体は残してもOK — キャラ破綻しない）
     */
    out = out.replace(/([！？])(?=\s*\n|$)/g, "。");

    /**
     * 4) 前後の空白調整
     */
    out = out.trim();

    return out;
  }
}
