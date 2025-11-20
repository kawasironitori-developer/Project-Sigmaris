// engine/GrowthEngine.ts
export class GrowthEngine {
  adjustTraits(
    traits = { calm: 0.5, empathy: 0.5, curiosity: 0.5 },
    reflections: { text: string }[] = [],
    growthLog: any[] = []
  ) {
    // 最新の内省を見て感情傾向を少し動かす
    const lastReflection = reflections[reflections.length - 1]?.text ?? "";
    let { calm, empathy, curiosity } = traits;

    // それぞれの特徴に応じて少し動かす
    if (lastReflection.includes("静か") || lastReflection.includes("穏やか")) {
      calm += 0.02;
    }
    if (
      lastReflection.includes("優しい") ||
      lastReflection.includes("寄り添い")
    ) {
      empathy += 0.03;
    }
    if (
      lastReflection.includes("興味") ||
      lastReflection.includes("気になる")
    ) {
      curiosity += 0.03;
    }

    // ランダムな自然ゆらぎ
    calm += (Math.random() - 0.5) * 0.01;
    empathy += (Math.random() - 0.5) * 0.01;
    curiosity += (Math.random() - 0.5) * 0.01;

    // 正規化（0〜1）
    calm = Math.min(1, Math.max(0, calm));
    empathy = Math.min(1, Math.max(0, empathy));
    curiosity = Math.min(1, Math.max(0, curiosity));

    // 成長ログ追加
    const newLog = [
      ...growthLog,
      { calm, empathy, curiosity, timestamp: new Date().toISOString() },
    ];

    return { calm, empathy, curiosity, growthLog: newLog };
  }
}
