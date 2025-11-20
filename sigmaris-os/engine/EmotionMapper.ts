// engine/EmotionMapper.ts
export interface EmotionScore {
  calm: number;
  empathy: number;
  curiosity: number;
}

export class EmotionMapper {
  private keywords = {
    calm: ["静か", "落ち着", "穏やか", "ゆっくり"],
    empathy: ["あなた", "気持ち", "理解", "共感", "寄り添"],
    curiosity: ["考え", "知り", "聞き", "学び", "興味"],
  };

  analyze(text: string): EmotionScore {
    const lower = text.toLowerCase();
    const score: EmotionScore = { calm: 0, empathy: 0, curiosity: 0 };
    const total = text.length || 1;

    for (const [trait, keys] of Object.entries(this.keywords)) {
      for (const key of keys) {
        const regex = new RegExp(key, "gi");
        const matches = lower.match(regex);
        if (matches) score[trait as keyof EmotionScore] += matches.length;
      }
    }

    // normalize to 0–1
    for (const k of Object.keys(score) as (keyof EmotionScore)[]) {
      score[k] = Math.min(1, score[k] / (total / 5));
    }

    return score;
  }
}
