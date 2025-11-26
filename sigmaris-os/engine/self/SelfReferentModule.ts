// /engine/self/SelfReferentModule.ts

import type {
  StateContext,
  SelfReferentInfo,
} from "@/engine/state/StateContext";

/**
 * Sigmaris OS — Self-Referent Module（B仕様 / v3.4）
 * ---------------------------------------------------------
 * ・StateContext.self_ref（SelfReferentInfo）と完全互換。
 * ・target / confidence / cues / note の4項目のみを返す。
 * ・null / undefined / 空文字も安全に処理。
 */
export class SelfReferentModule {
  /** -------------------------------------------------------
   * analyze() — 発話から SelfReferentInfo を生成
   * ----------------------------------------------------- */
  static analyze(text: string | null | undefined): SelfReferentInfo {
    if (!text || !text.trim()) {
      return {
        target: "unknown",
        confidence: 0,
        cues: [],
        note: "Empty input.",
      };
    }

    const lowered = text.toLowerCase();

    // --- AI を指す cue ---
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

    // --- User を指す cue ---
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

    // --- 第三者 cue ---
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

    // cue 検出
    const foundSelf = selfCues.filter((c) => lowered.includes(c));
    const foundUser = userCues.filter((c) => lowered.includes(c));
    const foundThird = thirdCues.filter((c) => lowered.includes(c));

    // 疑問系は Self スコア控えめ
    const isQuestion = lowered.endsWith("?") || lowered.includes("？");
    const softenFactor = isQuestion ? 0.6 : 1.0;

    const scoreSelf = foundSelf.length * 0.5 * softenFactor;
    const scoreUser = foundUser.length * 0.4;
    const scoreThird = foundThird.length * 0.4;

    // 特殊：Sigmaris 固有名は最優先
    if (lowered.includes("sigmaris") || lowered.includes("シグマリス")) {
      return {
        target: "self",
        confidence: 1.0,
        cues: ["sigmaris"],
        note: "Explicit reference to Sigmaris.",
      };
    }

    // Self
    if (scoreSelf > scoreUser && scoreSelf > scoreThird && scoreSelf > 0) {
      return {
        target: "self",
        confidence: Math.min(scoreSelf, 1.0),
        cues: foundSelf,
        note: `Self-referent cues detected: ${foundSelf.join(", ")}`,
      };
    }

    // User
    if (scoreUser > scoreSelf && scoreUser > scoreThird && scoreUser > 0) {
      return {
        target: "user",
        confidence: Math.min(scoreUser, 1.0),
        cues: foundUser,
        note: `Refers to the user: ${foundUser.join(", ")}`,
      };
    }

    // Third
    if (scoreThird > 0) {
      return {
        target: "third",
        confidence: Math.min(scoreThird, 1.0),
        cues: foundThird,
        note: `Refers to a third party: ${foundThird.join(", ")}`,
      };
    }

    // unknown
    return {
      target: "unknown",
      confidence: 0,
      cues: [],
      note: "No referent cues detected.",
    };
  }

  /** -------------------------------------------------------
   * attach() — StateContext.self_ref へセット
   * ----------------------------------------------------- */
  static attach(ctx: StateContext, info: SelfReferentInfo | null): void {
    ctx.self_ref = info;
  }
}
