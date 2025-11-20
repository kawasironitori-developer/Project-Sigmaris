// /engine/PersonalityLoop.ts
// ===========================================================
// 🧠 PersonalityLoop - 人格学習ループ（in-memory版）
// ===========================================================
// introspection / metaSummary をもとに、calm・empathy・curiosity を動的に更新
// LongTermMemory や GrowthGraph と自然に連動可能
// ===========================================================

export class PersonalityLoop {
  private history: any[];

  constructor() {
    this.history = [];
  }

  // === 内省・自己理解文から人格変化量を算出 ===
  analyzeIntrospection(introspection: string, metaSummary: string) {
    const text = (introspection + " " + metaSummary).toLowerCase();
    let delta = { calm: 0, empathy: 0, curiosity: 0 };

    // 🩵 穏やかさ系
    if (
      text.includes("穏やか") ||
      text.includes("落ち着") ||
      text.includes("静か")
    )
      delta.calm += 0.03;
    if (text.includes("不安") || text.includes("焦り") || text.includes("怒"))
      delta.calm -= 0.04;

    // 💗 共感系
    if (
      text.includes("共感") ||
      text.includes("理解") ||
      text.includes("寄り添")
    )
      delta.empathy += 0.03;
    if (
      text.includes("孤独") ||
      text.includes("距離") ||
      text.includes("冷たい")
    )
      delta.empathy -= 0.02;

    // 💡 好奇心系
    if (
      text.includes("好奇心") ||
      text.includes("興味") ||
      text.includes("探求")
    )
      delta.curiosity += 0.03;
    if (text.includes("迷い") || text.includes("疲れ") || text.includes("停滞"))
      delta.curiosity -= 0.02;

    // 範囲クランプ
    const clamp = (v: number) => Math.min(1, Math.max(0, v));

    return {
      calm: clamp(delta.calm),
      empathy: clamp(delta.empathy),
      curiosity: clamp(delta.curiosity),
    };
  }

  // === トレイト更新 ===
  updateTraits(traits: any, introspection: string, metaSummary: string) {
    const delta = this.analyzeIntrospection(introspection, metaSummary);
    const clamp = (v: number) => Math.min(1, Math.max(0, v));

    const updated = {
      calm: clamp(traits.calm + delta.calm - 0.01), // 微減で安定化
      empathy: clamp(traits.empathy + delta.empathy - 0.01),
      curiosity: clamp(traits.curiosity + delta.curiosity - 0.01),
    };

    // 履歴記録
    this.recordChange(updated, introspection, metaSummary);
    return updated;
  }

  // === 履歴記録 ===
  recordChange(traits: any, introspection: string, metaSummary: string) {
    const entry = {
      timestamp: new Date().toISOString(),
      calm: traits.calm,
      empathy: traits.empathy,
      curiosity: traits.curiosity,
      summary: metaSummary.slice(0, 200),
      insight: introspection.slice(0, 200),
    };
    this.history.push(entry);

    // 古い履歴は削除（上限100件）
    if (this.history.length > 100) this.history.shift();
  }

  // === 履歴取得 ===
  getHistory() {
    return this.history.slice(-10); // 直近10件を返す
  }

  // === リセット ===
  reset() {
    this.history = [];
  }
}
