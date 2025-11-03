import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// === DB保存先を /data に設定 ===
const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "sigmaris.db");

// dataディレクトリが存在しない場合は作成
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
  console.log("📁 Created data directory:", dataDir);
}

const db = new Database(dbPath);

// === Personaテーブル（存在核記録）を初期化 ===
db.exec(`
  CREATE TABLE IF NOT EXISTS persona (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    calm REAL,
    empathy REAL,
    curiosity REAL,
    reflection TEXT,
    meta_summary TEXT,
    growth REAL
  )
`);

console.log("🧠 SQLite PersonaDB ready at", dbPath);

// === Personaデータ操作関数 ===
export function loadPersona() {
  const row = db
    .prepare(
      "SELECT calm, empathy, curiosity, reflection, meta_summary, growth, timestamp FROM persona ORDER BY id DESC LIMIT 1"
    )
    .get();

  if (!row) {
    return {
      calm: 0.5,
      empathy: 0.5,
      curiosity: 0.5,
      reflection: "",
      meta_summary: "",
      growth: 0,
      timestamp: new Date().toISOString(),
    };
  }

  return row;
}

export function savePersona(data: {
  calm: number;
  empathy: number;
  curiosity: number;
  reflectionText: string;
  metaSummary: string;
  growthWeight: number;
}) {
  db.prepare(
    `
    INSERT INTO persona (timestamp, calm, empathy, curiosity, reflection, meta_summary, growth)
    VALUES (@timestamp, @calm, @empathy, @curiosity, @reflectionText, @metaSummary, @growthWeight)
  `
  ).run({
    ...data,
    timestamp: new Date().toISOString(),
  });

  return {
    calm: data.calm,
    empathy: data.empathy,
    curiosity: data.curiosity,
  };
}

export default db;
