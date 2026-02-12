export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import { getSupabaseServer } from "@/lib/supabaseServer";

type Row = {
  session_id: string | null;
  created_at: string;
  session_title: string | null;
};

function publicConfig() {
  const enabled = (process.env.SIGMARIS_PORTFOLIO_PUBLIC_ENABLED ?? "").trim().toLowerCase();
  const userId = (process.env.SIGMARIS_PORTFOLIO_PUBLIC_USER_ID ?? "").trim();
  const ok = ["1", "true", "yes", "on"].includes(enabled) && !!userId;
  return { ok, userId };
}

export async function GET() {
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

    const supabase = getSupabaseServer();

    // NOTE: do NOT select `content` for public portfolio pages.
    const { data, error } = await supabase
      .from("common_messages")
      .select("session_id, created_at, session_title")
      .eq("app", "sigmaris")
      .eq("user_id", viewerUserId)
      .order("created_at", { ascending: false })
      .limit(8000);

    if (error) throw error;

    const rows = (data ?? []) as Row[];
    const sessionMap = new Map<
      string,
      { updatedAt: string; count: number; title: string }
    >();

    for (const msg of rows) {
      const sid = msg.session_id || "default-session";
      if (!sessionMap.has(sid)) {
        sessionMap.set(sid, {
          updatedAt: msg.created_at,
          count: 1,
          title: msg.session_title || `Session ${sid.slice(0, 8)}`,
        });
      } else {
        const entry = sessionMap.get(sid)!;
        entry.count += 1;
      }
    }

    const sessions = Array.from(sessionMap.entries())
      .map(([id, info]) => ({
        id,
        title: info.title,
        // Intentionally blank (no message content)
        lastMessage: "",
        updatedAt: info.updatedAt,
        messageCount: info.count,
      }))
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

    return NextResponse.json({ ok: true, sessions, public: isPublic });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}

