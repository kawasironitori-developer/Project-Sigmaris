// /app/api/persona/history/route.ts
import db from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const rows = db
      .prepare(
        "SELECT timestamp, calm, empathy, curiosity, growth FROM persona ORDER BY id ASC"
      )
      .all();
    return NextResponse.json({ ok: true, data: rows });
  } catch (err: any) {
    console.error("[API:persona/history]", err);
    return NextResponse.json({ ok: false, error: err.message });
  }
}
