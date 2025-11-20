// /engine/SafetyLayer.ts
import { TraitVector, safeTraitValue } from "@/lib/traits";

/**
 * SafetyLayer
 *  - Traitの安定性を保証し、異常値や暴走傾向を抑制する。
 *  - calm / empathy / curiosity の過剰変動を防止。
 */
export class SafetyLayer {
  /**
   * Trait値を安全にクランプ（制限）する。
   * @param traits 現在のTraitベクトル
   */
  static normalize(traits: TraitVector): TraitVector {
    const clamp = (v: number) => Math.min(1, Math.max(0, safeTraitValue(v)));

    return {
      calm: clamp(traits.calm),
      empathy: clamp(traits.empathy),
      curiosity: clamp(traits.curiosity),
    };
  }

  /**
   * Traitバランスを評価して安定指数を返す。
   * @returns 0〜1（1 = 完全安定）
   */
  static stabilityIndex(traits: TraitVector): number {
    const spread =
      Math.abs(traits.calm - traits.empathy) +
      Math.abs(traits.empathy - traits.curiosity) +
      Math.abs(traits.curiosity - traits.calm);
    return Math.max(0, 1 - spread / 3); // 差が小さいほど安定
  }

  /**
   * 過熱状態を検知して警告メッセージを生成する。
   */
  static checkOverload(traits: TraitVector): string | null {
    const unstable =
      traits.calm < 0.2 && traits.curiosity > 0.8
        ? "思考過熱"
        : traits.calm < 0.3 && traits.empathy < 0.3
        ? "情動低下"
        : null;

    if (!unstable) return null;

    return `⚠️ 安定性警告：${unstable}が検知されました。システムは自己調整モードに入ります。`;
  }

  /**
   * 安定化フィルタ
   * - 安定指数が低い場合、Traitを再平準化して返す
   */
  static stabilize(traits: TraitVector): TraitVector {
    const stability = this.stabilityIndex(traits);
    if (stability >= 0.75) return traits;

    // 平均化で暴走を抑える
    const avg =
      (safeTraitValue(traits.calm) +
        safeTraitValue(traits.empathy) +
        safeTraitValue(traits.curiosity)) /
      3;

    return {
      calm: (traits.calm + avg) / 2,
      empathy: (traits.empathy + avg) / 2,
      curiosity: (traits.curiosity + avg) / 2,
    };
  }
}
