// app/api/chat/route.ts

/**
 * この API Route の役割
 * ---------------------
 * フロントエンド（ChatPane）から送られてきた
 * - キャラクターID
 * - 会話履歴
 * を受け取り、
 *
 * 1. 最新のユーザー発言を抽出
 * 2. Persona OS API に中継
 * 3. 返ってきた応答をそのまま返す
 *
 * ⚠️ このファイルでは：
 * - 人格プロンプトは組み立てない
 * - LLM / OpenAI API を直接触らない
 * - 会話状態・記憶は一切保持しない
 *
 * あくまで「API の窓口」専用レイヤー
 */

import { NextRequest, NextResponse } from "next/server";

/* =========================
   Persona OS API 設定
========================= */

/**
 * Persona OS 側の /chat エンドポイント
 * - 本番：Fly.io
 * - 開発：localhost
 *
 * 未ログイン時：ここを使う（現状の挙動そのまま）
 */
const PERSONA_OS_ENDPOINT =
  process.env.PERSONA_OS_URL ?? "http://127.0.0.1:8000/chat";

/**
 * ログイン済み時：ローカル Python に固定で投げたい場合のエンドポイント
 * - ここだけ強制で localhost を使う
 *
 * ※必要なら env で差し替え可
 */
const PERSONA_OS_LOCAL_ENDPOINT =
  process.env.PERSONA_OS_LOCAL_URL ?? "http://127.0.0.1:8000/chat";

/* =========================
   型定義
========================= */

type ChatMessage = {
  role: "user" | "ai";
  content: string;
};

type PersonaOsResponse = {
  reply: string;
  // meta などが返ってきてもここでは受け取らなくていい（必要になったら拡張）
};

/**
 * フロント → この API に渡す payload
 *
 * ✅ 未ログイン：userId を送らない（現状互換）
 * ✅ ログイン済み：userId に Supabase Auth の user.id を入れて送る
 */
type FrontendChatRequestBody = {
  characterId: string;
  messages: ChatMessage[];

  /**
   * ログイン済みなら Supabase Auth の user.id（UUID）を入れる
   * 未ログインなら undefined / null / 空文字で送らない
   */
  userId?: string | null;
};

/* =========================
   POST Handler
========================= */

/**
 * POST /api/chat
 *
 * 受け取る JSON：
 * {
 *   characterId: string,
 *   messages: { role: "user" | "ai", content: string }[],
 *   userId?: string | null
 * }
 *
 * 返す JSON：
 * {
 *   role: "ai",
 *   content: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    /* =========================
       ① リクエストボディ取得
    ========================= */

    const body = (await req.json()) as FrontendChatRequestBody;

    const { characterId, messages, userId } = body;

    /* =========================
       ② 入力バリデーション
    ========================= */

    if (!characterId || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    /* =========================
       ③ 最新ユーザー発言の抽出
    ========================= */

    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");

    if (!lastUserMessage) {
      return NextResponse.json(
        { error: "No user message found" },
        { status: 400 }
      );
    }

    /* =========================
       ④ ログイン状態判定（ここが分岐点）
    ========================= */

    const normalizedUserId =
      typeof userId === "string" && userId.trim() ? userId.trim() : null;

    /**
     * ✅ 未ログイン：現状のまま（PERSONA_OS_ENDPOINT / session_id 固定）
     * ✅ ログイン済み：ローカル Python（PERSONA_OS_LOCAL_ENDPOINT）へ投げる
     *                かつ session_id を userId に差し替える
     *
     * 目的：
     * - DB で conversation を user_id 単位に安定させる
     * - ローカル Python を「ログインユーザー用の処理」に使える
     */
    const endpointToUse = normalizedUserId
      ? PERSONA_OS_LOCAL_ENDPOINT
      : PERSONA_OS_ENDPOINT;

    const sessionIdToUse = normalizedUserId
      ? normalizedUserId
      : "frontend-session";

    /* =========================
       ⑤ Persona OS API に中継
    ========================= */

    const personaResponse = await fetch(endpointToUse, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Persona OS の ChatRequest に合わせる
        session_id: sessionIdToUse,
        character_id: characterId,
        text: lastUserMessage.content,
      }),
    });

    if (!personaResponse.ok) {
      const text = await personaResponse.text();
      console.error("[Persona OS Error]", {
        status: personaResponse.status,
        endpoint: endpointToUse,
        body: text,
      });
      throw new Error("Persona OS API request failed");
    }

    const personaJson = (await personaResponse.json()) as PersonaOsResponse;

    /* =========================
       ⑥ FE 互換形式で返却
    ========================= */

    return NextResponse.json({
      role: "ai",
      content: personaJson.reply,
    });
  } catch (error) {
    /* =========================
       ⑦ エラーハンドリング
    ========================= */

    console.error("[/api/chat] Error:", error);

    return NextResponse.json(
      {
        role: "ai",
        content: "……少し調子が悪いみたい。時間をおいて試して。",
      },
      { status: 500 }
    );
  }
}
