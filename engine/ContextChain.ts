// engine/ContextChain.ts
export interface ContextItem {
  user: string;
  ai: string;
}

export class ContextChain {
  private history: ContextItem[] = [];
  private limit = 3; // 直近3ターンまで保持

  // 履歴を追加（古いものは削除）
  add(user: string, ai: string) {
    this.history.push({ user, ai });
    if (this.history.length > this.limit) {
      this.history.shift();
    }
  }

  // 直近の会話をまとめて要約
  summarize(): string {
    if (this.history.length === 0) return "";
    const mapped = this.history
      .map((h, i) => `(${i + 1}) ユーザー: ${h.user}\nAI: ${h.ai}`)
      .join("\n");
    return `直近の会話履歴:\n${mapped}`;
  }

  // 🧩 新規追加: 文脈の深度（履歴数）を返す
  getDepth(): number {
    return this.history.length;
  }

  // 履歴をすべてクリア
  clear() {
    this.history = [];
  }
}
