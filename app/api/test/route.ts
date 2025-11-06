// app/api/test/route.ts
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET() {
  const { data, error } = await supabase.from("persona").select("*").limit(1);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
