// engine/PersonaDB.ts
import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve("./data/personality.db");

export class PersonaDB {
  private db: Database.Database;

  constructor() {
    this.db = new Database(dbPath);
    this.db
      .prepare(
        `
        CREATE TABLE IF NOT EXISTS personality (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          calm REAL,
          empathy REAL,
          curiosity REAL,
          metaSummary TEXT,
          reflection TEXT,
          introspection TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `
      )
      .run();
  }

  /** 最新人格データをロード */
  loadLatest() {
    const row = this.db
      .prepare(
        "SELECT calm, empathy, curiosity, metaSummary FROM personality ORDER BY id DESC LIMIT 1"
      )
      .get();
    return (
      row || {
        calm: 0.5,
        empathy: 0.5,
        curiosity: 0.5,
        metaSummary: "初期状態：穏やかで探求心を持つAI人格。",
      }
    );
  }

  /** 新しい人格データを保存 */
  save({
    calm,
    empathy,
    curiosity,
    metaSummary,
    reflection,
    introspection,
  }: {
    calm: number;
    empathy: number;
    curiosity: number;
    metaSummary: string;
    reflection: string;
    introspection: string;
  }) {
    this.db
      .prepare(
        `INSERT INTO personality (calm, empathy, curiosity, metaSummary, reflection, introspection)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(calm, empathy, curiosity, metaSummary, reflection, introspection);
  }

  /** 全人格履歴を取得（グラフ用など） */
  getAll() {
    return this.db
      .prepare(
        "SELECT id, calm, empathy, curiosity, metaSummary, created_at FROM personality ORDER BY id ASC"
      )
      .all();
  }
}
