import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// === DB保存先を /data に設定 ===
const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "sigmaris.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
  console.log("📁 Created data directory:", dataDir);
}

let db: Database.Database;
try {
  db = new Database(dbPath);
  console.log("🧠 SQLite PersonaDB ready at", dbPath);
} catch (err) {
  console.error("❌ DB initialization failed:", err);
  throw err;
}

// === Personaテーブル ===
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

// === 履歴テーブル ===
db.exec(`
  CREATE TABLE IF NOT EXISTS persona_logs (
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

// === 型定義 ===
export interface PersonaRow {
  calm: number;
  empathy: number;
  curiosity: number;
  reflection: string;
  meta_summary: string;
  growth: number;
  timestamp: string;
}

// === 最新のPersonaをロード ===
export function loadPersona(): PersonaRow {
  try {
    const row = db
      .prepare(
        `SELECT calm, empathy, curiosity, reflection, meta_summary, growth, timestamp
         FROM persona ORDER BY id DESC LIMIT 1`
      )
      .get() as PersonaRow | undefined;

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
  } catch (e) {
    console.error("loadPersona error:", e);
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
}

// === Personaを保存（最新＋履歴＋JSON追記） ===
export function savePersona(data: {
  calm: number;
  empathy: number;
  curiosity: number;
  reflectionText?: string;
  metaSummary?: string;
  meta_summary?: string;
  growthWeight?: number;
  growth?: number;
}) {
  const timestamp = new Date().toISOString();

  const reflectionText = data.reflectionText ?? "";
  const metaSummary = data.metaSummary ?? data.meta_summary ?? "";
  const growthWeight = data.growthWeight ?? data.growth ?? 0;

  const payload = {
    timestamp,
    calm: data.calm ?? 0.5,
    empathy: data.empathy ?? 0.5,
    curiosity: data.curiosity ?? 0.5,
    reflectionText,
    metaSummary,
    growthWeight,
  };

  try {
    db.prepare(
      `INSERT INTO persona
       (timestamp, calm, empathy, curiosity, reflection, meta_summary, growth)
       VALUES (@timestamp, @calm, @empathy, @curiosity, @reflectionText, @metaSummary, @growthWeight)`
    ).run(payload);

    db.prepare(
      `INSERT INTO persona_logs
       (timestamp, calm, empathy, curiosity, reflection, meta_summary, growth)
       VALUES (@timestamp, @calm, @empathy, @curiosity, @reflectionText, @metaSummary, @growthWeight)`
    ).run(payload);

    // ✅ JSONログにも成長履歴を記録
    logGrowthToJson(payload);
  } catch (e) {
    console.error("savePersona error:", e);
  }

  return {
    calm: payload.calm,
    empathy: payload.empathy,
    curiosity: payload.curiosity,
  };
}

// === 履歴をJSONに書き出す ===
function logGrowthToJson(entry: any) {
  const growthPath = path.join(process.cwd(), "data", "growth.json");
  let existing: any[] = [];

  try {
    if (fs.existsSync(growthPath)) {
      const raw = fs.readFileSync(growthPath, "utf8");
      existing = JSON.parse(raw);
      if (!Array.isArray(existing)) existing = [];
    }
  } catch {
    existing = [];
  }

  existing.push({
    calm: entry.calm,
    empathy: entry.empathy,
    curiosity: entry.curiosity,
    timestamp: entry.timestamp,
  });

  // 履歴を最大100件に制限
  if (existing.length > 100) existing.shift();

  fs.writeFileSync(growthPath, JSON.stringify(existing, null, 2));
}

// === 履歴を取得 ===
export function getPersonaLogs(limit = 20): PersonaRow[] {
  try {
    return db
      .prepare(
        `SELECT calm, empathy, curiosity, reflection, meta_summary, growth, timestamp
         FROM persona_logs ORDER BY id DESC LIMIT ?`
      )
      .all(limit) as PersonaRow[];
  } catch (e) {
    console.error("getPersonaLogs error:", e);
    return [];
  }
}

// === 履歴を削除 ===
export function clearPersonaLogs() {
  try {
    db.exec("DELETE FROM persona_logs");
    console.log("🧹 Cleared persona_logs");
  } catch (e) {
    console.error("clearPersonaLogs error:", e);
  }
}

export default db;
