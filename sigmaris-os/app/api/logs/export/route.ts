export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import { getSupabaseServer } from "@/lib/supabaseServer";

type IncludeKey =
  | "messages"
  | "state"
  | "telemetry"
  | "temporal_identity"
  | "subjectivity"
  | "failure"
  | "identity"
  | "trace_events";

function parseBool(v: string | null, fallback = false): boolean {
  if (v === null || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

function clampInt(v: string | null, def: number, min: number, max: number): number {
  const n = Number(v ?? "");
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function parseIncludeList(v: string | null): Set<IncludeKey> {
  const all: IncludeKey[] = [
    "messages",
    "state",
    "telemetry",
    "temporal_identity",
    "subjectivity",
    "failure",
    "identity",
    "trace_events",
  ];
  if (!v) return new Set(all);
  const parts = v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const set = new Set<IncludeKey>();
  for (const p of parts) {
    if ((all as string[]).includes(p)) set.add(p as IncludeKey);
  }
  return set.size ? set : new Set(all);
}

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
    const sessionId = (searchParams.get("session_id") ?? "").trim() || null;
    const limit = clampInt(searchParams.get("limit"), 200, 1, 2000);
    const include = parseIncludeList(searchParams.get("include"));
    const since = (searchParams.get("since") ?? "").trim() || null; // ISO string

    // For quick exports, allow disabling the heaviest tables.
    const includePhase02 = parseBool(searchParams.get("include_phase02"), true);

    const supabase = getSupabaseServer();

    const whereSession = (q: any) => (sessionId ? q.eq("session_id", sessionId) : q);
    const whereSince = (q: any) =>
      since ? q.gte("created_at", since) : q;

    const tasks: Record<string, PromiseLike<any>> = {};

    if (include.has("messages")) {
      let q = supabase
        .from("common_messages")
        .select("id, session_id, app, role, content, speaker_id, meta, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      q = whereSession(whereSince(q));
      tasks.messages = q;
    }

    if (include.has("state")) {
      let q = supabase
        .from("common_state_snapshots")
        .select(
          "id, session_id, trace_id, global_state, overload_score, reflective_score, memory_pointer_count, safety_flag, safety_risk_score, value_state, trait_state, meta, created_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      q = whereSession(whereSince(q));
      tasks.state = q;
    }

    if (include.has("telemetry")) {
      let q = supabase
        .from("common_telemetry_snapshots")
        .select("id, session_id, trace_id, scores, ema, flags, reasons, meta, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      q = whereSession(whereSince(q));
      tasks.telemetry = q;
    }

    if (includePhase02) {
      if (include.has("temporal_identity")) {
        let q = supabase
          .from("common_temporal_identity_snapshots")
          .select("id, session_id, trace_id, ego_id, state, telemetry, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(limit);
        q = whereSession(whereSince(q));
        tasks.temporal_identity = q;
      }

      if (include.has("subjectivity")) {
        let q = supabase
          .from("common_subjectivity_snapshots")
          .select("id, session_id, trace_id, subjectivity, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(limit);
        q = whereSession(whereSince(q));
        tasks.subjectivity = q;
      }

      if (include.has("failure")) {
        let q = supabase
          .from("common_failure_snapshots")
          .select("id, session_id, trace_id, failure, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(limit);
        q = whereSession(whereSince(q));
        tasks.failure = q;
      }

      if (include.has("identity")) {
        let q = supabase
          .from("common_identity_snapshots")
          .select("id, session_id, trace_id, snapshot, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(limit);
        q = whereSession(whereSince(q));
        tasks.identity = q;
      }

      if (include.has("trace_events")) {
        let q = supabase
          .from("common_trace_events")
          .select("id, trace_id, event, fields, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(limit);
        q = whereSince(q);
        // common_trace_events does not have session_id in schema; filter by trace_id is possible
        tasks.trace_events = q;
      }
    }

    const entries = Object.entries(tasks);
    const results = await Promise.all(entries.map(([, p]) => p));

    const out: Record<string, any> = {
      ok: true,
      exported_at: new Date().toISOString(),
      user_id: user.id,
      filters: {
        session_id: sessionId,
        since,
        limit,
        include: Array.from(include.values()),
        include_phase02: includePhase02,
      },
    };

    for (let i = 0; i < entries.length; i++) {
      const key = entries[i][0];
      const { data, error } = results[i] ?? {};
      if (error) throw error;
      // Return ascending time for easier reading.
      out[key] = (data ?? []).slice().reverse();
    }

    return NextResponse.json(out);
  } catch (err: any) {
    console.error("[/api/logs/export] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
