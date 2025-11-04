import { NextResponse } from "next/server";
import db, { PersonaRow, loadPersona, savePersona } from "@/lib/db";
import { ReflectionEngine } from "@/engine/ReflectionEngine";
import { PersonaSync } from "@/engine/sync/PersonaSync";

// === POST: 人格情報の保存 ===
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { traits, reflectionText, metaSummary, growthWeight, autoReflect } =
      body;

    // === Personaデータ挿入 ===
    const stmt = db.prepare(`
      INSERT INTO persona (timestamp, calm, empathy, curiosity, reflection, meta_summary, growth)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      new Date().toISOString(),
      traits?.calm ?? 0,
      traits?.empathy ?? 0,
      traits?.curiosity ?? 0,
      reflectionText ?? "",
      metaSummary ?? "",
      growthWeight ?? 0
    );

    // === 自動リフレクト機能（Phase 08.5 用） ===
    if (autoReflect) {
      const engine = new ReflectionEngine();
      const latest = PersonaSync.load();
      const output = await engine.fullReflect(
        [{ weight: growthWeight }],
        [{ user: "system", ai: reflectionText }],
        [metaSummary]
      );
      return NextResponse.json({ status: "auto-reflected", result: output });
    }

    return NextResponse.json({ status: "saved" });
  } catch (err) {
    console.error("Persona POST error:", err);
    return NextResponse.json(
      { error: "failed to save persona" },
      { status: 500 }
    );
  }
}

// === GET: 最新の人格データを取得 ===
export async function GET() {
  try {
    const row = db
      .prepare(
        `SELECT calm, empathy, curiosity, reflection, meta_summary, growth, timestamp
         FROM persona ORDER BY id DESC LIMIT 1`
      )
      .get() as PersonaRow | undefined; // ← 型を明示！

    if (!row) {
      return NextResponse.json({ error: "no data" }, { status: 404 });
    }

    // PersonaSync 形式へ整形（UI整合）
    const persona: PersonaRow = {
      calm: row.calm ?? 0.5,
      empathy: row.empathy ?? 0.5,
      curiosity: row.curiosity ?? 0.5,
      reflection: row.reflection ?? "",
      meta_summary: row.meta_summary ?? "",
      growth: row.growth ?? 0,
      timestamp: row.timestamp ?? new Date().toISOString(),
    };

    return NextResponse.json(persona);
  } catch (err) {
    console.error("Persona GET error:", err);
    return NextResponse.json(
      { error: "failed to load persona" },
      { status: 500 }
    );
  }
}
