import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, requireUserId } from "@/lib/supabase-server";

function looksLikeMissingColumn(err: unknown, column: string) {
  const msg =
    (typeof (err as { message?: unknown } | null)?.message === "string"
      ? String((err as { message?: unknown }).message)
      : "") || String(err ?? "");
  return msg.includes(column) && (msg.includes("column") || msg.includes("schema"));
}

/* =========================
   PATCH /api/session/[sessionId]
   - タイトル編集 / chat_mode 更新
========================= */

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await context.params;

    console.log(
      "[/api/session/[id]][PATCH] cookie:",
      req.headers.get("cookie"),
    );

    const supabase = await supabaseServer();
    const userId = await requireUserId();

    const body = (await req.json()) as { title?: unknown; chatMode?: unknown };

    const title = typeof body.title === "string" ? body.title.trim() : null;
    const chatMode = typeof body.chatMode === "string" ? body.chatMode : null;

    const patch: Record<string, unknown> = {};
    if (title) patch.title = title;
    if (chatMode) patch.chat_mode = chatMode;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No patch fields" }, { status: 400 });
    }

    if ("chat_mode" in patch) {
      const cm = String(patch.chat_mode);
      if (cm !== "partner" && cm !== "roleplay" && cm !== "coach") {
        return NextResponse.json({ error: "Invalid chatMode" }, { status: 400 });
      }
    }

    // 🔒 存在確認（他人・削除済み防止）
    const { data: exists, error: selectError } = await supabase
      .from("common_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .eq("app", "touhou")
      .maybeSingle();

    if (selectError || !exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("common_sessions")
      .update(patch)
      .eq("id", sessionId)
      .eq("user_id", userId)
      .eq("app", "touhou");

    if (error) {
      if ("chat_mode" in patch && looksLikeMissingColumn(error, "chat_mode")) {
        return NextResponse.json(
          {
            error: "chat_mode column is missing",
            hint: "Run supabase/RESET_TO_COMMON.sql in Supabase SQL Editor.",
          },
          { status: 409 },
        );
      }
      console.error("[PATCH session] Supabase error:", error);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, sessionId });
  } catch (err) {
    console.error("[PATCH session] Error:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/* =========================
   DELETE /api/session/[sessionId]
   - セッション削除（物理削除）
========================= */

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await context.params;

    console.log(
      "[/api/session/[id]][DELETE] cookie:",
      req.headers.get("cookie"),
    );

    const supabase = await supabaseServer();
    const userId = await requireUserId();

    // 🔒 存在確認（二重 delete / 他人防止）
    const { data: exists, error: selectError } = await supabase
      .from("common_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .eq("app", "touhou")
      .maybeSingle();

    if (selectError || !exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // conversations を物理削除
    // messages は DB 側で ON DELETE CASCADE 前提
    const { error } = await supabase
      .from("common_sessions")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", userId)
      .eq("app", "touhou");

    if (error) {
      console.error("[DELETE session] Supabase error:", error);
      return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, sessionId });
  } catch (err) {
    console.error("[DELETE session] Error:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
