// engine/IntentClassifier.ts
export interface IntentFrame {
  intent: string;
  emotion: string;
  confidence: number;
}

export class IntentClassifier {
  private keywords: Record<string, string[]> = {
    question: ["?", "なぜ", "どうして", "どこ", "いつ", "だれ"],
    gratitude: ["ありがとう", "感謝", "助かる", "嬉しい"],
    sadness: ["悲しい", "寂しい", "つらい", "しんどい"],
    curiosity: ["気になる", "興味", "知りたい", "なんだろう"],
    affection: ["好き", "君", "あなた", "会いたい"],
    anger: ["怒", "ムカ", "腹立", "ふざけ"],
  };

  classify(message: string): IntentFrame {
    const lower = message.toLowerCase();
    let intent = "conversation";
    let emotion = "neutral";
    let confidence = 0.5;

    // intent detection
    if (this.keywords.question.some((k) => lower.includes(k)))
      intent = "question";
    if (this.keywords.gratitude.some((k) => lower.includes(k)))
      intent = "gratitude";
    if (this.keywords.sadness.some((k) => lower.includes(k))) emotion = "sad";
    if (this.keywords.curiosity.some((k) => lower.includes(k)))
      emotion = "curious";
    if (this.keywords.affection.some((k) => lower.includes(k)))
      emotion = "warm";
    if (this.keywords.anger.some((k) => lower.includes(k))) emotion = "angry";

    // confidence heuristic
    confidence = lower.length < 5 ? 0.5 : Math.min(1, 0.5 + lower.length / 200);

    return { intent, emotion, confidence };
  }
}
