// engine/MetaMemory.ts
import fs from "fs";
import path from "path";

/**
 * MetaMemory:
 * introspection（メタ認知）ログを保存・傾向分析するクラス。
 * シグマリス人格OS用に型競合を完全排除した安定版。
 */

// --- 共通Trait型 ---
interface TraitTriplet {
  calm: number;
  empathy: number;
  curiosity: number;
}

// --- 単一記録エントリ型 ---
interface MetaEntry {
  timestamp?: string;
  message: string;
  reply: string;
  introspection: string;
  traits?: TraitTriplet;
}

// --- 複数記録型 ---
interface MetaBatch {
  messages: MetaEntry[];
}

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
   * 🧩 save: introspection結果を保存
   * 単一または複数(messages配列)どちらも対応。
   * Snapshot型との競合を防ぐため、ローカル型で固定。
   */
  save(entry: MetaEntry | MetaBatch): void {
    const current = this.load();

    if ((entry as MetaBatch).messages) {
      // 🧩 複数メッセージ対応
      for (const m of (entry as MetaBatch).messages) {
        current.push({
          timestamp: m.timestamp ?? new Date().toISOString(),
          message: m.message,
          reply: m.reply,
          introspection: m.introspection,
          traits: m.traits ?? { calm: 0.5, empathy: 0.5, curiosity: 0.5 },
        });
      }
    } else {
      // 🧩 単一メッセージ対応
      const e = entry as MetaEntry;
      current.push({
        timestamp: e.timestamp ?? new Date().toISOString(),
        message: e.message,
        reply: e.reply,
        introspection: e.introspection,
        traits: e.traits ?? { calm: 0.5, empathy: 0.5, curiosity: 0.5 },
      });
    }

    fs.writeFileSync(this.filePath, JSON.stringify(current, null, 2));
  }

  /**
   * load: ログを読み込み
   */
  load(): any[] {
    try {
      const data = fs.readFileSync(this.filePath, "utf8");
      return JSON.parse(data);
    } catch {
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
    const avg = (key: keyof TraitTriplet) =>
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
  clear(): void {
    fs.writeFileSync(this.filePath, JSON.stringify([]));
  }
}
