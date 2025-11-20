// /engine/emotion/EmotionLayer.ts
import type { StateContext } from "@/engine/state/StateContext";
import type { EmotionProfile } from "@/types/emotion";
import type { SafetyReport } from "@/types/safety";

/**
 * EmotionLayer
 * State ＋ Traits ＋ Safety 状態から「応答の温度」を計算する。
 * ・LLMへは styleHint と数値パラメータを渡して調整する。
 */
export class EmotionLayer {
  static synthesize(ctx: StateContext): EmotionProfile {
    const { traits, currentState, safety, reflectCount } = ctx;

    // ===== 1) 基本値（Traits ベース） =====
    let warmth = clamp01(0.3 + traits.empathy * 0.7);
    let energy = clamp01(
      0.2 + traits.curiosity * 0.6 + (1 - traits.calm) * 0.2
    );
    let directness = clamp01(
      0.3 + traits.calm * 0.3 + (1 - traits.empathy) * 0.4
    );
    let depth = clamp01(0.3 + traits.curiosity * 0.5 + reflectCount * 0.05);
    let distance = clamp01(0.6 - traits.empathy * 0.4 - traits.calm * 0.2);
    let playfulness = clamp01(traits.curiosity * 0.7 + (1 - traits.calm) * 0.1);

    // ===== 2) State による補正 =====
    switch (currentState) {
      case "Idle":
        energy *= 0.6;
        depth *= 0.7;
        break;

      case "Dialogue":
        // 標準会話モード：そのまま
        break;

      case "Reflect":
      case "Introspect":
        // 内省系：テンション抑えめ・深さ強め
        energy *= 0.7;
        depth = clamp01(depth + 0.2);
        playfulness *= 0.5;
        distance = clamp01(distance + 0.1);
        break;

      case "OverloadPrevent":
        // 過負荷保護：とにかく落ち着かせる
        energy *= 0.4;
        depth *= 0.6;
        playfulness *= 0.3;
        warmth = clamp01(warmth + 0.1);
        distance = clamp01(distance + 0.2);
        break;

      case "SafetyMode":
        // セーフティ優先：情報提供・冷静寄り
        energy *= 0.4;
        playfulness = 0;
        warmth *= 0.5;
        depth = clamp01(depth + 0.2);
        distance = clamp01(distance + 0.3);
        directness = clamp01(directness + 0.2);
        break;
    }

    // ===== 3) SafetyLayer のフラグによる補正 =====
    const safetyReport = safety as SafetyReport | null;

    if (safetyReport) {
      // 抽象過多・ループなどが疑われる場合はテンションと深さを抑える
      if (
        safetyReport.flags?.abstractionOverload ||
        safetyReport.flags?.loopSuspect
      ) {
        depth *= 0.7;
        energy *= 0.7;
      }

      // 再書き換え系アクション → 距離を少し置く
      if (safetyReport.action && safetyReport.action !== "allow") {
        distance = clamp01(distance + 0.2);
        playfulness *= 0.5;
      }
    }

    // ===== 4) ラベル生成 =====
    const styleHintJa = buildStyleHintJa({
      warmth,
      energy,
      directness,
      depth,
      distance,
      playfulness,
    });

    const styleHintEn = buildStyleHintEn({
      warmth,
      energy,
      directness,
      depth,
      distance,
      playfulness,
    });

    return {
      warmth,
      energy,
      directness,
      depth,
      distance,
      playfulness,
      styleHintJa,
      styleHintEn,
    };
  }
}

/** 0〜1 にクランプ */
function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0.5;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

// === スタイル説明文（日本語） ===
function buildStyleHintJa(
  base: Omit<EmotionProfile, "styleHintJa" | "styleHintEn">
): string {
  const tags: string[] = [];

  if (base.warmth > 0.7) tags.push("親しみのある柔らかいトーン");
  else if (base.warmth > 0.4) tags.push("落ち着いたフラットなトーン");
  else tags.push("少し距離を置いた冷静なトーン");

  if (base.energy > 0.7) tags.push("テンション高めでテンポよく");
  else if (base.energy < 0.3) tags.push("ゆっくり・丁寧に");

  if (base.depth > 0.7) tags.push("思考を深く掘り下げる");
  else if (base.depth < 0.3) tags.push("余計な説明は省いてシンプルに");

  if (base.playfulness > 0.6) tags.push("さりげなくユーモアを混ぜる");
  else if (base.playfulness < 0.2) tags.push("冗談は控えめに");

  if (base.distance < 0.3) tags.push("心理的距離は近めに話す");
  else if (base.distance > 0.7) tags.push("少し距離を保ちつつ冷静に");

  return tags.join("／");
}

// === スタイル説明文（English） ===
function buildStyleHintEn(
  base: Omit<EmotionProfile, "styleHintJa" | "styleHintEn">
): string {
  const tags: string[] = [];

  if (base.warmth > 0.7) tags.push("warm and gentle tone");
  else if (base.warmth > 0.4) tags.push("calm and neutral tone");
  else tags.push("slightly distant and cool tone");

  if (base.energy > 0.7) tags.push("high energy, quick tempo");
  else if (base.energy < 0.3) tags.push("slow and careful pacing");

  if (base.depth > 0.7) tags.push("dig into deeper reasoning");
  else if (base.depth < 0.3) tags.push("keep explanations minimal and simple");

  if (base.playfulness > 0.6) tags.push("sprinkle light humor");
  else if (base.playfulness < 0.2) tags.push("avoid jokes");

  if (base.distance < 0.3) tags.push("speak as if psychologically close");
  else if (base.distance > 0.7) tags.push("maintain some emotional distance");

  return tags.join(" / ");
}
