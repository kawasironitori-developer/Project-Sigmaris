// /engine/EmotionSynth.ts
import { TraitVector, safeTraitValue } from "@/lib/traits";

/**
 * EmotionSynth
 *  ├ generateTone() : traits → tone文字列
 *  └ applyTone()    : toneをtextに付与
 */
export class EmotionSynth {
  static generateTone(traits: TraitVector): string {
    const calm = safeTraitValue(traits.calm);
    const empathy = safeTraitValue(traits.empathy);
    const curiosity = safeTraitValue(traits.curiosity);

    // トーン判定（数値しきい値を柔軟化）
    if (calm > 0.8 && empathy > 0.7) return "穏やかで優しい";
    if (calm < 0.4 && curiosity > 0.7) return "興奮気味で探求的な";
    if (empathy > 0.8 && curiosity < 0.5) return "共感的で思慮深い";
    if (curiosity > 0.8) return "探究心に満ちた";
    if (calm < 0.3) return "やや不安定な";
    return "ニュートラルな";
  }

  static applyTone(text: string, traits: TraitVector): string {
    const tone = this.generateTone(traits);
    return `（${tone}トーン）${text}`;
  }
}
