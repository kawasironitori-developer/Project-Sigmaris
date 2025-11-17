/**
 * ===========================================
 *  Sigmaris OS — TraitVector 定義（v1）
 * -------------------------------------------
 *  calm：      落ち着き（0〜1）
 *  empathy：   共感性（0〜1）
 *  curiosity： 好奇心（0〜1）
 *
 *  全モジュール共通仕様：
 *  - ReflectionEngine（±0.05微変動）
 *  - SafetyLayer（normalize / limitDelta）
 *  - EmotionSynth（tone決定）
 *  - IntrospectionEngine（傾向判定）
 *  - PersonaSync（DB保存）
 * ===========================================
 */

export interface TraitVector {
  calm: number;
  empathy: number;
  curiosity: number;
}

/**
 * ===========================================
 * 数値を安全に0〜1へ正規化
 * - 数値でない場合 → 0.5（中立）
 * - Infinity/NaN → 0.5
 * - 範囲外 → 0〜1へクリップ
 * ===========================================
 */
export function safeTraitValue(v: any): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0.5;
  return Math.min(1, Math.max(0, v));
}

/**
 * ===========================================
 * TraitVector を完全正規化（SafetyLayer互換）
 * ===========================================
 */
export function normalizeTraits(t: TraitVector): TraitVector {
  return {
    calm: safeTraitValue(t.calm),
    empathy: safeTraitValue(t.empathy),
    curiosity: safeTraitValue(t.curiosity),
  };
}

/**
 * ===========================================
 * 2つの TraitVector を平均して生成
 * - PersonaSync.merge() と整合
 * ===========================================
 */
export function blendTraits(a: TraitVector, b: TraitVector): TraitVector {
  return {
    calm: (a.calm + b.calm) / 2,
    empathy: (a.empathy + b.empathy) / 2,
    curiosity: (a.curiosity + b.curiosity) / 2,
  };
}

/**
 * ===========================================
 * Trait間距離（ユークリッド距離）
 * - MetaReflectionEngine の成長推定に使用
 * - SafetyLayer の不安定度測定にも利用可能
 * ===========================================
 */
export function traitDistance(a: TraitVector, b: TraitVector): number {
  const dc = a.calm - b.calm;
  const de = a.empathy - b.empathy;
  const du = a.curiosity - b.curiosity;
  return Math.sqrt(dc * dc + de * de + du * du);
}

/**
 * ===========================================
 * 安定指数（Stability Index）
 * - 1 に近いほど安定した Trait である
 * - SafetyLayer / MetaReflectionEngine 用
 *
 * 計算式：
 *  - 3軸の平均値からの距離 → 不安定度
 *  - それを 1 から減算 → 安定度指数
 * ===========================================
 */
export function stabilityIndex(t: TraitVector): number {
  const avg = (t.calm + t.empathy + t.curiosity) / 3;

  const dist = Math.sqrt(
    Math.pow(t.calm - avg, 2) +
      Math.pow(t.empathy - avg, 2) +
      Math.pow(t.curiosity - avg, 2)
  );

  // 距離が大きいほど不安定 → 1 - dist*3
  return Math.max(0, 1 - dist * 3);
}
