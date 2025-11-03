import { NextResponse } from "next/server";
import db from "@/lib/db";

// === POST: 人格情報の保存 ===
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { traits, reflectionText, metaSummary, growthWeight } = body;

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
      .prepare(`SELECT * FROM persona ORDER BY id DESC LIMIT 1`)
      .get();

    if (!row) {
      return NextResponse.json({ error: "no data" }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (err) {
    console.error("Persona GET error:", err);
    return NextResponse.json(
      { error: "failed to load persona" },
      { status: 500 }
    );
  }
}
