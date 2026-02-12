export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import { getSupabaseServer } from "@/lib/supabaseServer";

function publicConfig() {
  const enabled = (process.env.SIGMARIS_PORTFOLIO_PUBLIC_ENABLED ?? "").trim().toLowerCase();
  const userId = (process.env.SIGMARIS_PORTFOLIO_PUBLIC_USER_ID ?? "").trim();
  const ok = ["1", "true", "yes", "on"].includes(enabled) && !!userId;
  return { ok, userId };
}

function isRecord(v: any): v is Record<string, any> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function pickMetaSafe(meta: any) {
  if (!isRecord(meta)) return null;
  const metaV1 = isRecord(meta.meta_v1) ? meta.meta_v1 : isRecord(meta.v1) ? meta.v1 : null;
  const personaRuntime = isRecord(meta.persona_runtime) ? meta.persona_runtime : null;
  return {
    trace_id: typeof meta.trace_id === "string" ? meta.trace_id : null,
    build_sha: typeof meta.build_sha === "string" ? meta.build_sha : null,
    config_hash: typeof meta.config_hash === "string" ? meta.config_hash : null,
    timing_ms: typeof meta.timing_ms === "number" ? meta.timing_ms : null,
    global_state: isRecord(meta.global_state) ? meta.global_state : null,
    meta_v1: metaV1,
    persona_runtime: personaRuntime,
  };
}

export async function GET(req: Request) {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    const pub = publicConfig();
    const isPublic = (!user || authError) && pub.ok;
    const viewerUserId = (user?.id as string | undefined) || (isPublic ? pub.userId : "");
    if (!viewerUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const sessionId = (url.searchParams.get("session_id") ?? "").trim();
    const limitRaw = Number(url.searchParams.get("limit") ?? "500");
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(2000, limitRaw)) : 500;
    if (!sessionId) {
      return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("common_state_snapshots")
      .select("id, session_id, trace_id, meta, created_at")
      .eq("user_id", viewerUserId)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const snapshots = (data ?? [])
      .slice()
      .reverse()
      .map((row: any) => ({
        id: row.id,
        session_id: row.session_id,
        trace_id: row.trace_id,
        created_at: row.created_at,
        meta: pickMetaSafe(row.meta),
      }));

    return NextResponse.json({ ok: true, snapshots, public: isPublic });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}

