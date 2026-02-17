import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, requireUserId } from "@/lib/supabase-server";

/* =========================
   型定義
========================= */

type ConversationRow = {
  id: string;
  character_id: string;
};

type MessageRow = {
  id: string;
  role: "user" | "ai";
  content: string;
  speaker_id: string | null;
  created_at: string;
  meta: Record<string, unknown> | null;
};

type MessagesResponse = {
  messages: MessageRow[];
};

/* =========================
   GET /api/session/[sessionId]/messages
   - リロード復元用
   - キャラ混線防止込み
========================= */

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    /* =========================
       ① sessionId 取得（Next.js 14 正式）
    ========================= */

    const { sessionId } = await context.params;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    // console.log(
    //   "[/api/session/[id]/messages][GET] cookie:",
    //   req.headers.get("cookie"),
    // );

    /* =========================
       ② Auth
    ========================= */

    const supabase = await supabaseServer();
    const userId = await requireUserId();

    /* =========================
       ③ 会話取得（character_id 含む）
    ========================= */

    const { data: conv, error: convError } = await supabase
      .from("common_sessions")
      .select("id, character_id")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .eq("app", "touhou")
      .maybeSingle<ConversationRow>();

    if (convError) {
      console.error("[DB:conversation select error]", convError);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    if (!conv) {
      return NextResponse.json(
        { error: "Conversation not found or forbidden" },
        { status: 403 },
      );
    }

    const sessionCharacterId = conv.character_id;

    /* =========================
       ④ messages 取得
    ========================= */

    const { data, error } = await supabase
      .from("common_messages")
      .select("id, role, content, speaker_id, created_at, meta")
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .eq("app", "touhou")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[DB:messages select error]", error);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 },
      );
    }

    /* =========================
       ⑤ キャラ混線防止フィルタ
    ========================= */

    const filteredMessages: MessageRow[] = (data ?? []).filter((m) => {
      if (m.role === "user") return true;
      return m.speaker_id === sessionCharacterId;
    });

    /* =========================
       ⑥ Return
    ========================= */

    const response: MessagesResponse = {
      messages: filteredMessages,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[/api/session/[sessionId]/messages][GET] Error:", error);
    return NextResponse.json(
      { error: "Unauthorized or server error" },
      { status: 401 },
    );
  }
}
