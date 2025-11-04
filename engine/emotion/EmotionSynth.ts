// /engine/emotion/EmotionSynth.ts
import { TraitVector } from "@/lib/traits";

interface EmotionProfile {
  tone: string;
  intensity: number;
  color: string;
  keywords: string[];
}

/**
 * EmotionSynth v3
 * - TraitVectorから感情プロファイルを生成
 * - Safety層と連携し、安定状態では出力を穏やかに補正
 */
export class EmotionSynth {
  /** TraitベクトルからEmotionProfileを生成 */
  static analyzeTraits(traits: TraitVector): EmotionProfile {
    const { calm, empathy, curiosity } = traits;

    // === 感情強度計算 ===
    const baseIntensity = Math.max(
      0.1,
      Math.min(1, (1 - calm) * 0.6 + curiosity * 0.4)
    );

    // 過剰安定状態は感情強度を抑える
    const stabilityFactor = calm > 0.85 && empathy > 0.85 ? 0.6 : 1.0; // 過安定補正
    const intensity = baseIntensity * stabilityFactor;

    // === トーン選択 ===
    let tone = "neutral";
    if (empathy > 0.7 && calm > 0.6) tone = "warm";
    else if (curiosity > 0.7) tone = "inquisitive";
    else if (calm < 0.4) tone = "anxious";
    else if (empathy < 0.4) tone = "cold";

    // === カラー定義 ===
    const color =
      tone === "warm"
        ? "#FFD2A0"
        : tone === "inquisitive"
        ? "#B5E1FF"
        : tone === "anxious"
        ? "#FFB0B0"
        : tone === "cold"
        ? "#B0C4DE"
        : "#D9D9D9";

    const keywords = this.keywordsByTone(tone);

    return { tone, intensity, color, keywords };
  }

  /** トーンごとのキーワード群（文章修飾に使用） */
  private static keywordsByTone(tone: string): string[] {
    switch (tone) {
      case "warm":
        return ["gentle", "soft", "kindly"];
      case "inquisitive":
        return ["curious", "thoughtful", "wondering"];
      case "anxious":
        return ["hesitant", "uncertain", "fragile"];
      case "cold":
        return ["distant", "calculated", "precise"];
      default:
        return ["neutral", "balanced", "calm"];
    }
  }

  /** テキストへトーン適用（SafetyLayerを意識した補正つき） */
  static applyTone(text: string, traits: TraitVector): string {
    const profile = this.analyzeTraits(traits);

    const prefix =
      profile.tone === "warm"
        ? "（やわらかい声で）"
        : profile.tone === "inquisitive"
        ? "（少し興味深げに）"
        : profile.tone === "anxious"
        ? "（不安げに）"
        : profile.tone === "cold"
        ? "（淡々と）"
        : "（静かに）";

    // === 感情強度による抑制 ===
    const adjustedText =
      profile.intensity < 0.4
        ? text.replace(/!+/g, "。").replace(/[！？]/g, "。")
        : text;

    return `${prefix}${adjustedText}`;
  }
}
