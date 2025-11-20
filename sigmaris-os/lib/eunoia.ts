// === 修正版 /lib/eunoia.ts ===
// Eunoia Core - AEI Tone Modulator & Emotion Analyzer

export interface EunoiaState {
  tone: "neutral" | "gentle" | "friendly" | "soft";
  empathyLevel: number; // 0〜1
}

/**
 * 入力テキストを“しぐちゃん”のトーンに変換する
 * ※相槌（うん・そうだね）は挿入しない自然文モード
 */
export function applyEunoiaTone(input: string, state: EunoiaState): string {
  let output = input.trim();

  // --- ベース：語尾のやわらかさのみ適用 ---
  switch (state.tone) {
    case "gentle":
      output = output
        .replace(/です。/g, "ですよ。")
        .replace(/ます。/g, "ますね。");
      break;
    case "friendly":
      output = output
        .replace(/です。/g, "だよ。")
        .replace(/ます。/g, "するね。");
      break;
    case "soft":
      output = output
        .replace(/です。/g, "…だよ。")
        .replace(/ます。/g, "…するね。");
      break;
  }

  // --- ❌ 相槌・演出削除 ---
  // 以前は empathyLevel に応じて「うん」「そうだね」を付与していたが削除

  // --- 語尾の自然整形 ---
  if (!/[。！!？?]$/.test(output)) output += "。";
  return output;
}

/**
 * Emotion Analyzer
 */
export function deriveEunoiaState(traits: {
  calm: number;
  empathy: number;
  curiosity: number;
}): EunoiaState & { color: string; label: string } {
  const avg = (traits.calm + traits.empathy + traits.curiosity) / 3;
  let tone: EunoiaState["tone"] = "neutral";
  let color = "#9ca3af"; // gray
  let label = "Neutral";

  if (avg > 0.8) {
    tone = "gentle";
    color = "#AEE6D8";
    label = "Peaceful";
  } else if (traits.empathy > 0.7) {
    tone = "friendly";
    color = "#FFD2A0";
    label = "Warm";
  } else if (traits.curiosity > 0.7) {
    tone = "soft";
    color = "#B3E5FC";
    label = "Inquisitive";
  } else if (traits.calm < 0.3) {
    tone = "soft";
    color = "#FCA5A5";
    label = "Tense";
  }

  return {
    tone,
    empathyLevel: traits.empathy,
    color,
    label,
  };
}
