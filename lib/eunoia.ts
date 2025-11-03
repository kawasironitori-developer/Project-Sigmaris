// lib/eunoia.ts
// Eunoia Core - AEI Tone Modulator

export interface EunoiaState {
  tone: "neutral" | "gentle" | "friendly" | "soft";
  empathyLevel: number; // 0〜1
}

/**
 * 入力テキストを“しぐちゃん”のトーンに変換する
 */
export function applyEunoiaTone(input: string, state: EunoiaState): string {
  let output = input.trim();

  // --- ベース：語尾や接続表現のやわらかさ ---
  if (state.tone === "gentle") {
    output = output
      .replace(/です。/g, "ですよ。")
      .replace(/ます。/g, "ますね。");
  } else if (state.tone === "friendly") {
    output = output.replace(/です。/g, "だね。").replace(/ます。/g, "するね。");
  } else if (state.tone === "soft") {
    output = output
      .replace(/です。/g, "…ですよ。")
      .replace(/ます。/g, "…ますね。");
  }

  // --- 感情レイヤー挿入 ---
  if (state.empathyLevel > 0.7) {
    output = "うん、" + output;
  } else if (state.empathyLevel > 0.4) {
    output = "そうだね、" + output;
  }

  // 語尾が冷たい時は柔らかく締める
  if (!/[。！!？?]$/.test(output)) output += "ね。";

  return output;
}
