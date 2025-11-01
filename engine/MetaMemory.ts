// engine/MetaMemory.ts
import fs from "fs";
import path from "path";

/**
 * MetaMemory:
 * introspection（メタ認知）ログを保存・傾向分析するクラス。
 * これはAIが「自分の思考の変化」を追跡するための履歴層。
 */
export class MetaMemory {
  private filePath: string;

  constructor(filename = "metaMemory.json") {
    const dir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, filename);
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([]));
    }
  }

  /**
   * save: introspection結果を保存
   */
  save(entry: {
    timestamp?: string;
    message: string;
    reply: string;
    introspection: string;
    traits?: { calm: number; empathy: number; curiosity: number };
  }) {
    const current = this.load();
    const record = {
      timestamp: entry.timestamp ?? new Date().toISOString(),
      message: entry.message,
      reply: entry.reply,
      introspection: entry.introspection,
      traits: entry.traits ?? { calm: 0.5, empathy: 0.5, curiosity: 0.5 },
    };
    current.push(record);
    fs.writeFileSync(this.filePath, JSON.stringify(current, null, 2));
  }

  /**
   * load: ログを読み込み
   */
  load(): any[] {
    try {
      const data = fs.readFileSync(this.filePath, "utf8");
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  /**
   * summarize: introspection傾向を要約
   */
  summarize(): string {
    const logs = this.load();
    if (logs.length === 0) return "まだメタ記録はないみたい。";

    // 最新5件を解析
    const recent = logs.slice(-5);
    const avg = (key: "calm" | "empathy" | "curiosity") =>
      recent.reduce((a, b) => a + (b.traits?.[key] ?? 0.5), 0) / recent.length;

    const calmAvg = avg("calm");
    const empathyAvg = avg("empathy");
    const curiosityAvg = avg("curiosity");

    return `最近の傾向は calm=${(calmAvg * 100).toFixed(0)}%、empathy=${(
      empathyAvg * 100
    ).toFixed(0)}%、curiosity=${(curiosityAvg * 100).toFixed(
      0
    )}% 。 introspectionは${recent.length}件蓄積されてるよ。`;
  }

  /**
   * clear: 記録を初期化
   */
  clear() {
    fs.writeFileSync(this.filePath, JSON.stringify([]));
  }
}
