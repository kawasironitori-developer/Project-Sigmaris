// /app/api/sessions/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";

/**
 * === GET: セッション一覧取得 ===
 * - ユーザーの全セッションを返す
 * - 各セッションのタイトル・最終発言・更新時刻・件数を含む
 */
export async function GET() {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      console.warn("⚠️ Unauthorized access to /api/sessions");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseServer();

    const { data, error } = await supabase
      .from("common_messages")
      .select("session_id, content, role, created_at, session_title")
      .eq("app", "sigmaris")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) return NextResponse.json({ sessions: [] });

    const sessionMap = new Map<
      string,
      { lastMessage: string; updatedAt: string; count: number; title: string }
    >();

    for (const msg of data) {
      const sid = msg.session_id || "default-session";
      const content = msg.content ?? "";
      if (!sessionMap.has(sid)) {
        sessionMap.set(sid, {
          lastMessage: content.slice(0, 60),
          updatedAt: msg.created_at,
          count: 1,
          title: msg.session_title || `セッション ${sid.slice(0, 8)}`, // DBタイトル優先
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
        lastMessage: info.lastMessage,
        updatedAt: info.updatedAt,
        messageCount: info.count,
      }))
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

    console.log(`📦 [${user.id}] loaded ${sessions.length} sessions`);
    return NextResponse.json({ sessions });
  } catch (err: any) {
    console.error("[/api/sessions GET] failed:", err);
    return NextResponse.json(
      { error: err.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * === PATCH: セッションタイトル変更 ===
 * - 指定した session_id のタイトルを更新
 * - messages に含まれる session_title を更新
 */
export async function PATCH(req: Request) {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      console.warn("⚠️ Unauthorized PATCH /api/sessions");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId, newTitle } = await req.json();
    if (!sessionId || !newTitle) {
      return NextResponse.json(
        { error: "Missing sessionId or newTitle" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();
    const { error } = await supabase
      .from("common_messages")
      .update({ session_title: newTitle })
      .eq("app", "sigmaris")
      .eq("user_id", user.id)
      .eq("session_id", sessionId);

    if (error) throw error;

    console.log(`✏️ [${user.id}] session ${sessionId} renamed → "${newTitle}"`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[/api/sessions PATCH] failed:", err);
    return NextResponse.json(
      { error: err.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * === DELETE: セッション削除 ===
 * - 指定した session_id の履歴をすべて削除
 * - messages, reflections, growth_logs, safety_logs に対応
 */
export async function DELETE(req: Request) {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      console.warn("⚠️ Unauthorized DELETE /api/sessions");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("id");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing session id" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();
    const tables = [
      "common_messages",
      "common_reflections",
      "common_state_snapshots",
      "common_telemetry_snapshots",
      "common_temporal_identity_snapshots",
      "common_subjectivity_snapshots",
      "common_failure_snapshots",
      "common_identity_snapshots",
      "common_integration_events",
    ];

    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("user_id", user.id)
        .eq("session_id", sessionId);

      if (error)
        console.warn(`⚠️ [${table}] delete failed:`, error.message ?? error);
    }

    // common_sessions (optional; sigmaris-os may or may not create session rows)
    try {
      await supabase
        .from("common_sessions")
        .delete()
        .eq("app", "sigmaris")
        .eq("user_id", user.id)
        .eq("id", sessionId);
    } catch {
      // ignore
    }

    console.log(`🗑️ [${user.id}] deleted session ${sessionId}`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[/api/sessions DELETE] failed:", err);
    return NextResponse.json(
      { error: err.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
