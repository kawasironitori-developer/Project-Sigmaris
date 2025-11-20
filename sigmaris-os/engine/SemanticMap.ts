// /engine/SemanticMap.ts
export type Concept = {
  lemma: string;
  kind: "abstract" | "concrete" | "meta" | "action" | "feeling";
  tags: string[];
  emotionHints: Array<"calm" | "empathy" | "curiosity">;
};

export type SemanticFrame = {
  concepts: Concept[];
  sentiment: number; // -1..1
  abstractRatio: number; // 概念の抽象度比
  intents: string[]; // ask / reflect / assert
  hasSelfReference: boolean;
};

/* ============================================================
   LEXICON — 抽象概念・感情・行動の最小辞書
   ※ Sigmaris OS v1 では「簡易語彙」に留める
============================================================ */
const LEXICON: Record<string, Concept> = {
  音楽: {
    lemma: "音楽",
    kind: "abstract",
    tags: ["art"],
    emotionHints: ["calm", "empathy"],
  },
  曲: {
    lemma: "曲",
    kind: "concrete",
    tags: ["art"],
    emotionHints: ["calm", "empathy"],
  },
  タイトル: {
    lemma: "タイトル",
    kind: "meta",
    tags: ["metadata"],
    emotionHints: ["curiosity"],
  },
  ピアノ: {
    lemma: "ピアノ",
    kind: "concrete",
    tags: ["instrument"],
    emotionHints: ["calm"],
  },
  美しい: {
    lemma: "美しい",
    kind: "feeling",
    tags: ["valence"],
    emotionHints: ["empathy"],
  },
  存在: {
    lemma: "存在",
    kind: "abstract",
    tags: ["existence", "self"],
    emotionHints: ["curiosity"],
  },
  意味: {
    lemma: "意味",
    kind: "abstract",
    tags: ["meta", "self"],
    emotionHints: ["curiosity"],
  },
  目的: {
    lemma: "目的",
    kind: "abstract",
    tags: ["teleology", "self"],
    emotionHints: ["curiosity"],
  },
  私: {
    lemma: "私",
    kind: "meta",
    tags: ["self"],
    emotionHints: ["empathy"],
  },
  自分: {
    lemma: "自分",
    kind: "meta",
    tags: ["self"],
    emotionHints: ["empathy"],
  },
  聴く: {
    lemma: "聴く",
    kind: "action",
    tags: ["listen"],
    emotionHints: ["curiosity"],
  },
};

/* ============================================================
   パターンマッチ
============================================================ */
const SELF_PAT = /(私|自分|わたし|ぼく|僕)/;
const INTENT_ASK = /[?？]$|(?:どう|何|なに|どこ|いつ|なぜ|why|how|？|？)$/i;
const INTENT_REFLECT = /(気づ|内省|考え|思っ|振り返|reflect|ふり返)/;
const POSITIVE = /(良い|好き|美しい|落ち着|嬉|楽)/g;
const NEGATIVE = /(不安|疲れ|迷|嫌|怖|悲)/g;

/* ============================================================
   SemanticMap 本体
============================================================ */
export class SemanticMap {
  analyze(text: string): SemanticFrame {
    const tokens = this.tokenize(text);

    // === 1. lexical match ===
    const concepts = tokens.map((t) => LEXICON[t]).filter(Boolean) as Concept[];

    // === 2. abstract ratio ===
    const abstractCount = concepts.filter(
      (c) => c.kind === "abstract" || c.kind === "meta"
    ).length;
    const abstractRatio =
      concepts.length > 0 ? abstractCount / concepts.length : 0;

    // === 3. sentiment（単語スコア）
    let sentiment = 0;

    const posHits = text.match(POSITIVE)?.length ?? 0;
    const negHits = text.match(NEGATIVE)?.length ?? 0;

    if (posHits >= 2) sentiment += 0.5;
    if (negHits >= 2) sentiment -= 0.5;

    // === 4. intents ===
    const intents: string[] = [];
    if (INTENT_ASK.test(text)) intents.push("ask");
    if (INTENT_REFLECT.test(text)) intents.push("reflect");
    if (intents.length === 0) intents.push("assert");

    // === 5. self reference ===
    const hasSelfReference =
      SELF_PAT.test(text) || concepts.some((c) => c.tags.includes("self"));

    return {
      concepts: this.filterConceptRepeats(concepts),
      sentiment: Math.max(-1, Math.min(1, sentiment)),
      abstractRatio,
      intents,
      hasSelfReference,
    };
  }

  /* 重複概念のグループ化 */
  private filterConceptRepeats(concepts: Concept[]): Concept[] {
    const seen = new Set<string>();
    const out: Concept[] = [];
    for (const c of concepts) {
      const key = `${c.kind}:${c.tags.sort().join(",")}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(c);
      }
    }
    return out;
  }

  /* ============================================================
     tokenize — 最小破綻の “ゆるい日本語トークン化”
     - 記号除去
     - 日本語語句
     - ASCII語（why/how等）
  ============================================================ */
  private tokenize(text: string): string[] {
    return text
      .split(/[^\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}A-Za-z0-9ー]+/u)
      .filter((t) => t.length > 0);
  }
}
