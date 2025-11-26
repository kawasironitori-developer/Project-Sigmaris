// /engine/self/selfReferent.ts

import type { SelfReferentInfo } from "@/engine/state/StateContext";

/**
 * Self-Referent Module (v3)
 * -----------------------------------------
 * 「誰について語られているか」を判定して SelfReferentInfo を返す。
 * - target: "self" | "user" | "third" | "unknown"
 * - confidence: 0.0〜1.0
 * - cues: 検知したキーワード
 * - note: 判定理由
 */
export class SelfReferentModule {
  /* ============================================================
   * analyze() — メイン判定
   * ============================================================ */
  static analyze(text: string): SelfReferentInfo {
    if (!text || text.trim().length === 0) {
      return this.empty("Empty input.");
    }

    const lowered = text.toLowerCase();

    // ------------------------------------------
    // 1) Cue sets（出現したらシグナルになる単語）
    // ------------------------------------------
    const selfCues = [
      "you",
      "your",
      "yourself",
      "sigmaris",
      "シグマリス",
      "シグちゃん",
      "君",
      "きみ",
      "お前",
      "あんた",
    ];

    const userCues = [
      "i",
      "me",
      "my",
      "mine",
      "わたし",
      "私",
      "俺",
      "僕",
      "あたし",
    ];

    const thirdCues = [
      "he",
      "she",
      "they",
      "them",
      "彼",
      "彼女",
      "あいつ",
      "あの人",
      "友達",
    ];

    // ------------------------------------------
    // 2) cue detection
    // ------------------------------------------
    const foundSelf = selfCues.filter((c) => lowered.includes(c));
    const foundUser = userCues.filter((c) => lowered.includes(c));
    const foundThird = thirdCues.filter((c) => lowered.includes(c));

    // ------------------------------------------
    // 3) 誤爆防止
    // ------------------------------------------
    const isQuestion = lowered.endsWith("?") || lowered.includes("？");
    const softenFactor = isQuestion ? 0.6 : 1.0;

    const scoreSelf = foundSelf.length * 0.5 * softenFactor;
    const scoreUser = foundUser.length * 0.4;
    const scoreThird = foundThird.length * 0.4;

    // Sigmaris 固有名は強スコア
    if (lowered.includes("sigmaris") || lowered.includes("シグマリス")) {
      return {
        target: "self",
        confidence: 1.0,
        cues: ["sigmaris"],
        note: "Explicit reference to Sigmaris.",
      };
    }

    // ------------------------------------------
    // 4) 最終判定
    // ------------------------------------------
    if (scoreSelf > scoreUser && scoreSelf > scoreThird && scoreSelf > 0) {
      return {
        target: "self",
        confidence: Math.min(scoreSelf, 1.0),
        cues: foundSelf,
        note: `Self-referent cues detected: ${foundSelf.join(", ")}`,
      };
    }

    if (scoreUser > scoreSelf && scoreUser > scoreThird && scoreUser > 0) {
      return {
        target: "user",
        confidence: Math.min(scoreUser, 1.0),
        cues: foundUser,
        note: `Refers to the user: ${foundUser.join(", ")}`,
      };
    }

    if (scoreThird > 0) {
      return {
        target: "third",
        confidence: Math.min(scoreThird, 1.0),
        cues: foundThird,
        note: `Refers to a third party: ${foundThird.join(", ")}`,
      };
    }

    // fallback
    return this.empty("No referent cues detected.");
  }

  /* ============================================================
   * empty()
   * ============================================================ */
  private static empty(note: string): SelfReferentInfo {
    return {
      target: "unknown",
      confidence: 0,
      cues: [],
      note,
    };
  }
}
