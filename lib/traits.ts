/**
 * シグちゃん人格システムの Trait（特性ベクトル）定義
 * calm：落ち着き 0〜1
 * empathy：共感性 0〜1
 * curiosity：好奇心 0〜1
 */
export interface TraitVector {
  calm: number;
  empathy: number;
  curiosity: number;
}

/**
 * 安全な数値変換ヘルパー
 * - null や undefined の場合は 0.5 を返す
 * - 0〜1の範囲にクリップ
 */
export function safeTraitValue(v: any): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0.5;
  return Math.min(1, Math.max(0, v));
}

/**
 * 2つのTraitを平均して中間値を作る
 */
export function blendTraits(a: TraitVector, b: TraitVector): TraitVector {
  return {
    calm: (a.calm + b.calm) / 2,
    empathy: (a.empathy + b.empathy) / 2,
    curiosity: (a.curiosity + b.curiosity) / 2,
  };
}

/**
 * Trait間の距離（ユークリッド距離）を計算
 * - 内省成長率やSafetyLayer安定度計測に利用
 */
export function traitDistance(a: TraitVector, b: TraitVector): number {
  const dc = a.calm - b.calm;
  const de = a.empathy - b.empathy;
  const du = a.curiosity - b.curiosity;
  return Math.sqrt(dc * dc + de * de + du * du);
}

/**
 * Traitを0〜1範囲に正規化
 */
export function normalizeTraits(t: TraitVector): TraitVector {
  return {
    calm: safeTraitValue(t.calm),
    empathy: safeTraitValue(t.empathy),
    curiosity: safeTraitValue(t.curiosity),
  };
}

/**
 * 安定指数を算出（1に近いほど安定）
 * - SafetyLayerなどで過熱や過安定の判定に使用
 */
export function stabilityIndex(t: TraitVector): number {
  const avg = (t.calm + t.empathy + t.curiosity) / 3;
  const dist = Math.sqrt(
    Math.pow(t.calm - avg, 2) +
      Math.pow(t.empathy - avg, 2) +
      Math.pow(t.curiosity - avg, 2)
  );
  return Math.max(0, 1 - dist * 3); // 距離が大きいほど不安定
}
