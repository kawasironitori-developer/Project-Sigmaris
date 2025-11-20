// /engine/state/utils/checkOverload.ts
import { StateContext } from "../StateContext";

/**
 * checkOverload()
 * 「負荷過多かどうか」を判定する軽量ユーティリティ。
 */
export function checkOverload(ctx: StateContext): boolean {
  const { traits, reflectCount, tokenUsage, safety } = ctx;

  // 1) Traits ベース
  const isCalmLow = traits.calm < 0.38;
  const tooManyReflects = reflectCount >= 3;
  const tokensOver = tokenUsage > 2000;

  // 2) SafetyReport.flags ベース（warnings が存在しないため）
  const safetyWarn =
    safety?.flags?.abstractionOverload === true ||
    safety?.flags?.selfReference === true ||
    safety?.flags?.loopSuspect === true;

  // 3) 判定
  return isCalmLow || tooManyReflects || tokensOver || Boolean(safetyWarn);
}
