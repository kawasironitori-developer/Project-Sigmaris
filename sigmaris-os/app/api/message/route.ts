import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";

/**
 * === GET: 特定セッションのメッセージ履歴を取得 ===
 * - クエリパラメータ `?session=<id>` を指定
 * - 各発言のロール・本文・時刻を返す
 */
export async function GET(req: Request) {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      console.warn("⚠️ Unauthorized access attempt to /api/messages");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session");

    if (!sessionId)
      return NextResponse.json(
        { error: "Missing session id" },
        { status: 400 }
      );

    const supabase = getSupabaseServer();

    // === 対象セッションのメッセージを取得 ===
    const { data, error } = await supabase
      .from("common_messages")
      .select("role, content, created_at")
      .eq("app", "sigmaris")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) return NextResponse.json({ messages: [] });

    // === user と ai メッセージをペア化 ===
    const merged: { user: string; ai: string; created_at?: string }[] = [];
    let currentUser = "";
    let currentCreatedAt = "";

    for (const msg of data) {
      if (msg.role === "user") {
        currentUser = msg.content;
        currentCreatedAt = msg.created_at;
      } else if (msg.role === "ai") {
        merged.push({
          user: currentUser,
          ai: msg.content,
          created_at: msg.created_at,
        });
        currentUser = "";
      }
    }

    return NextResponse.json({ messages: merged });
  } catch (err: any) {
    console.error("[/api/messages GET] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * === DELETE: メッセージ削除 ===
 * - モード1：特定セッション全削除 → ?session=<id>
 * - モード2：単一メッセージ削除 → body: { sessionId, createdAt }
 */
export async function DELETE(req: Request) {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      console.warn("⚠️ Unauthorized access attempt to /api/messages DELETE");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const supabase = getSupabaseServer();

    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session");

    // --- DELETEモード判定 ---
    let targetCreatedAt: string | null = null;
    try {
      const body = await req.json().catch(() => null);
      if (body?.createdAt) targetCreatedAt = body.createdAt;
    } catch {
      // JSON parse失敗 → 無視
    }

    if (!sessionId)
      return NextResponse.json(
        { error: "Missing session id" },
        { status: 400 }
      );

    if (targetCreatedAt) {
      // ✅ 単一メッセージ削除
      const { error } = await supabase
        .from("common_messages")
        .delete()
        .eq("app", "sigmaris")
        .eq("user_id", userId)
        .eq("session_id", sessionId)
        .eq("created_at", targetCreatedAt);

      if (error) throw error;
      console.log(
        `🗑️ Deleted 1 message (${targetCreatedAt}) from session ${sessionId}`
      );
      return NextResponse.json({ success: true, deleted: "single" });
    } else {
      // ✅ セッション全削除
      const { error } = await supabase
        .from("common_messages")
        .delete()
        .eq("app", "sigmaris")
        .eq("user_id", userId)
        .eq("session_id", sessionId);

      if (error) throw error;
      console.log(`🗑️ Deleted all messages in session ${sessionId}`);
      return NextResponse.json({ success: true, deleted: "session" });
    }
  } catch (err: any) {
    console.error("[/api/messages DELETE] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
