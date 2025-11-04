// Eunoia Core - AEI Tone Modulator & Emotion Analyzer

export interface EunoiaState {
  tone: "neutral" | "gentle" | "friendly" | "soft";
  empathyLevel: number; // 0〜1
}

/**
 * 入力テキストを“しぐちゃん”のトーンに変換する
 */
export function applyEunoiaTone(input: string, state: EunoiaState): string {
  let output = input.trim();

  // --- ベース：語尾のやわらかさ ---
  switch (state.tone) {
    case "gentle":
      output = output
        .replace(/です。/g, "ですよ。")
        .replace(/ます。/g, "ますね。");
      break;
    case "friendly":
      output = output
        .replace(/です。/g, "だね。")
        .replace(/ます。/g, "するね。");
      break;
    case "soft":
      output = output
        .replace(/です。/g, "…ですよ。")
        .replace(/ます。/g, "…ますね。");
      break;
  }

  // --- 感情レイヤー挿入 ---
  if (state.empathyLevel > 0.7) {
    output = "うん、" + output;
  } else if (state.empathyLevel > 0.4) {
    output = "そうだね、" + output;
  }

  // 語尾調整
  if (!/[。！!？?]$/.test(output)) output += "ね。";
  return output;
}

/**
 * Emotion Analyzer
 * calm / empathy / curiosity からトーン種別とカラーを決定する
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
