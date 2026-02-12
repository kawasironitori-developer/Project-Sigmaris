export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import { getSupabaseServer } from "@/lib/supabaseServer";

export async function GET() {
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

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("common_temporal_identity_snapshots")
      .select("id, session_id, trace_id, ego_id, state, telemetry, created_at")
      .eq("user_id", viewerUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ ok: true, snapshot: data ?? null, public: isPublic });
  } catch (err: any) {
    console.error("[/api/temporal-identity/latest] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
