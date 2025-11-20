// engine/GrowthTracker.ts
import { EmotionScore } from "./EmotionMapper";

export class GrowthTracker {
  private trends: Record<string, number> = {
    calm: 0.5,
    empathy: 0.5,
    curiosity: 0.5,
  };

  update(emotion: EmotionScore) {
    for (const [k, v] of Object.entries(emotion)) {
      const key = k as keyof EmotionScore;
      const delta = v * 0.05; // 感情強度に比例して少しずつ成長
      this.trends[key] = Math.min(
        1,
        Math.max(0, this.trends[key] + delta - 0.01)
      );
    }
  }

  getTrends() {
    return this.trends;
  }
}
