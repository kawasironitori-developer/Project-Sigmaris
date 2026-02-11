export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { supabaseServer, requireUser } from "@/lib/supabase-server";

type IncludeKey =
  | "session"
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
    "session",
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

function parseUserIdList(v: string | undefined): Set<string> {
  const parts = String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(parts);
}

function requireTouhouAdmin(userId: string) {
  const allow = new Set<string>([
    ...parseUserIdList(process.env.TOUHOU_ADMIN_USER_IDS),
    ...parseUserIdList(process.env.SIGMARIS_OPERATOR_USER_IDS),
  ]);
  if (!allow.size) return false;
  return allow.has(userId);
}

export async function GET(req: Request) {
  try {
    const user = await requireUser().catch(() => null);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!requireTouhouAdmin(user.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = (searchParams.get("session_id") ?? "").trim() || null;
    const limit = clampInt(searchParams.get("limit"), 200, 1, 2000);
    const include = parseIncludeList(searchParams.get("include"));
    const since = (searchParams.get("since") ?? "").trim() || null; // ISO string
    const includePhase02 = parseBool(searchParams.get("include_phase02"), true);

    const supabase = await supabaseServer();

    const whereSession = (q: any) => (sessionId ? q.eq("session_id", sessionId) : q);
    const whereSince = (q: any) => (since ? q.gte("created_at", since) : q);

    const tasks: Record<string, PromiseLike<any>> = {};

    if (include.has("session") && sessionId) {
      tasks.session = supabase
        .from("common_sessions")
        .select("id, app, title, character_id, mode, layer, location, chat_mode, meta, created_at, updated_at")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .maybeSingle();
    }

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
      if (key === "session") {
        out.session = data ?? null;
        continue;
      }
      out[key] = (data ?? []).slice().reverse();
    }

    return NextResponse.json(out);
  } catch (err: any) {
    console.error("[touhou /api/logs/export] failed:", err);
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 });
  }
}

