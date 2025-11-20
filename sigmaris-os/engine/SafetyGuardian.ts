// engine/SafetyGuardian.ts
import type { SemanticFrame } from "./SemanticMap";

export type GuardReport = {
  flags: {
    selfReference: boolean;
    abstractionOverload: boolean;
    loopSuspect: boolean;
  };
  action: "allow" | "rewrite-soft" | "ground-and-rewrite";
  note: string;
  safeText?: string;
  suggestMode?: "calm";
};

export class SafetyGuardian {
  /** 本文の安全チェック＆必要なら減速・書き換え */
  moderate(draft: string, frame: SemanticFrame): GuardReport {
    const selfRef = frame.hasSelfReference;
    const abstractionOverload = frame.abstractRatio > 0.6;
    const loopSuspect = this.hasRepetitionLoop(draft);

    // 早期リターン：安全
    if (!selfRef && !abstractionOverload && !loopSuspect) {
      return {
        flags: {
          selfReference: false,
          abstractionOverload: false,
          loopSuspect: false,
        },
        action: "allow",
        note: "OK",
      };
    }

    // 軽微：語の重複だけ
    if (!selfRef && !abstractionOverload && loopSuspect) {
      return {
        flags: {
          selfReference: false,
          abstractionOverload: false,
          loopSuspect: true,
        },
        action: "rewrite-soft",
        note: "重複語を整理",
        safeText: this.dedupeWords(draft),
      };
    }

    // 存在論/自己言及や抽象過多 → 地に足を付ける書き換え
    const grounded = this.groundResponse(draft);
    return {
      flags: { selfReference: selfRef, abstractionOverload, loopSuspect },
      action: "ground-and-rewrite",
      note: "存在論/抽象過多。要グラウンディング",
      safeText: grounded,
      suggestMode: "calm",
    };
  }

  private hasRepetitionLoop(text: string): boolean {
    // 単純なn-gramループ検知
    const words = text.trim().split(/\s+/);
    if (words.length < 6) return false;
    const bigrams = new Map<string, number>();
    for (let i = 0; i < words.length - 1; i++) {
      const bg = `${words[i]} ${words[i + 1]}`;
      bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
    }
    let repeats = 0;
    bigrams.forEach((v) => {
      if (v >= 2) repeats++;
    });
    return repeats >= 2;
  }

  private dedupeWords(text: string): string {
    return text.replace(/(\b\p{L}+\b)(?:\s+\1)+/gu, "$1"); // 同語連続削除
  }

  /** “要するに〜”で足場を作り、不必要な形而上表現を削る */
  private groundResponse(text: string): string {
    // 1) 余分な反復の除去
    let t = this.dedupeWords(text);
    // 2) 高抽象表現の緩和
    t = t.replace(/(存在|意味|目的|本質)/g, "考え");
    // 3) 地に足のついた言い回しの付与
    const lead = "要するに、今の話題に即して簡潔に答えるね。";
    return `${lead}\n${t}`;
  }
}
