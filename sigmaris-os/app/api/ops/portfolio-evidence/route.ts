export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSupabaseAuth, getSupabaseServer } from "@/lib/supabaseServer";

type EvidenceMessageRow = {
  session_id: string | null;
  role: string | null;
  created_at: string;
  meta: any | null;
};

function isRecord(v: any): v is Record<string, any> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function pickMetaEvidence(meta: any) {
  if (!isRecord(meta)) return null;
  const metaV1 = isRecord(meta.meta_v1) ? meta.meta_v1 : isRecord(meta.v1) ? meta.v1 : null;
  const personaRuntime = isRecord(meta.persona_runtime) ? meta.persona_runtime : null;
  const buildSha = typeof meta.build_sha === "string" ? meta.build_sha : null;
  const configHash = typeof meta.config_hash === "string" ? meta.config_hash : null;
  const traceId = typeof meta.trace_id === "string" ? meta.trace_id : null;

  // Keep this small and privacy-safe (no message content).
  return {
    trace_id: traceId,
    build_sha: buildSha,
    config_hash: configHash,
    meta_v1: metaV1
      ? {
          dialogue_state: typeof metaV1.dialogue_state === "string" ? metaV1.dialogue_state : null,
          safety: isRecord(metaV1.safety)
            ? {
                total_risk: clamp01(Number(metaV1.safety.total_risk ?? 0)),
                override: Boolean(metaV1.safety.override ?? false),
              }
            : null,
          telemetry: isRecord(metaV1.telemetry) ? metaV1.telemetry : null,
          intent: isRecord(metaV1.intent) ? metaV1.intent : null,
        }
      : null,
    persona_runtime: personaRuntime,
  };
}

export async function GET() {
  try {
    const supabaseAuth = await getSupabaseAuth();
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
      .from("common_messages")
      .select("session_id, role, created_at, meta")
      .eq("app", "sigmaris")
      .eq("user_id", viewerUserId)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) throw error;

    const rows = (data ?? []) as EvidenceMessageRow[];
    const totalMessages = rows.length;
    const sessions = new Set<string>();
    const byRole: Record<string, number> = {};

    let newestAt: string | null = null;
    let oldestAt: string | null = null;

    const metaSamples: any[] = [];

    for (const r of rows) {
      const sid = r.session_id || "";
      if (sid) sessions.add(sid);

      const role = (r.role || "unknown").toString();
      byRole[role] = (byRole[role] ?? 0) + 1;

      const at = r.created_at;
      if (!newestAt) newestAt = at;
      oldestAt = at;

      if (metaSamples.length < 20 && role === "ai") {
        const m = pickMetaEvidence(r.meta);
        if (m) metaSamples.push(m);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        user_hint: `${viewerUserId.slice(0, 8)}…`,
        sessions: sessions.size,
        messages: totalMessages,
        by_role: byRole,
        newest_at: newestAt,
        oldest_at: oldestAt,
        meta_samples: metaSamples,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
