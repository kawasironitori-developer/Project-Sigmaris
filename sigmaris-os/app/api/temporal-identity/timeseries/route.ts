export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import { getSupabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limitRaw = Number(searchParams.get("limit") ?? "120");
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(400, limitRaw))
      : 120;

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("common_temporal_identity_snapshots")
      .select("id, trace_id, ego_id, telemetry, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return NextResponse.json({ ok: true, snapshots: (data ?? []).reverse() });
  } catch (err: any) {
    console.error("[/api/temporal-identity/timeseries] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
