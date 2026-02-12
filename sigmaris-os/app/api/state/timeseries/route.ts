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

    const publicEnabled = (process.env.SIGMARIS_PORTFOLIO_PUBLIC_ENABLED ?? "").trim().toLowerCase();
    const publicUserId = (process.env.SIGMARIS_PORTFOLIO_PUBLIC_USER_ID ?? "").trim();
    const isPublic = (!user || authError) && ["1", "true", "yes", "on"].includes(publicEnabled) && !!publicUserId;
    const viewerUserId = (user?.id as string | undefined) || (isPublic ? publicUserId : "");
    if (!viewerUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limitRaw = Number(searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("common_state_snapshots")
      .select(
        "id, global_state, overload_score, reflective_score, memory_pointer_count, safety_risk_score, safety_flag, value_state, trait_state, meta, created_at"
      )
      .eq("user_id", viewerUserId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const snapshots = (data ?? []).slice().reverse();
    if (isPublic) {
      for (const row of snapshots as any[]) {
        if (row && typeof row === "object") row.meta = null;
      }
    }

    return NextResponse.json({ ok: true, snapshots, public: isPublic });
  } catch (err: any) {
    console.error("[/api/state/timeseries] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
