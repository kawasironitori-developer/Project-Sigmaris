export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import "server-only";

import { supabaseServer, requireUserId } from "@/lib/supabase-server";
import { buildTouhouPersonaSystem, genParamsFor, type TouhouChatMode } from "@/lib/touhouPersona";

type PersonaChatResponse = { reply: string; meta?: Record<string, unknown> };

function looksLikeMissingColumn(err: unknown, column: string) {
  const msg =
    (typeof (err as { message?: unknown } | null)?.message === "string"
      ? String((err as { message?: unknown }).message)
      : "") || String(err ?? "");
  return msg.includes(column) && (msg.includes("column") || msg.includes("schema"));
}

function coreBaseUrl() {
  const raw =
    process.env.SIGMARIS_CORE_URL ||
    process.env.PERSONA_OS_LOCAL_URL ||
    process.env.PERSONA_OS_URL ||
    "http://127.0.0.1:8000";
  return String(raw).replace(/\/+$/, "");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function toStateSnapshotRow(params: {
  userId: string;
  sessionId: string;
  meta: Record<string, unknown>;
}) {
  const meta = params.meta ?? {};

  const traceId = typeof meta.trace_id === "string" ? meta.trace_id : null;

  const globalState =
    isRecord(meta.global_state) && typeof meta.global_state.state === "string"
      ? meta.global_state.state
      : null;

  const overloadScore =
    isRecord(meta.controller_meta) && typeof meta.controller_meta.overload_score === "number"
      ? meta.controller_meta.overload_score
      : isRecord(meta.global_state) &&
          isRecord(meta.global_state.meta) &&
          typeof meta.global_state.meta.overload_score === "number"
        ? meta.global_state.meta.overload_score
        : null;

  const reflectiveScore =
    isRecord(meta.global_state) &&
    isRecord(meta.global_state.meta) &&
    typeof meta.global_state.meta.reflective_score === "number"
      ? meta.global_state.meta.reflective_score
      : null;

  const memoryPointerCount =
    isRecord(meta.controller_meta) &&
    isRecord(meta.controller_meta.memory) &&
    typeof meta.controller_meta.memory.pointer_count === "number"
      ? meta.controller_meta.memory.pointer_count
      : isRecord(meta.memory) && typeof meta.memory.pointer_count === "number"
        ? meta.memory.pointer_count
        : null;

  const safetyFlag =
    isRecord(meta.safety) && typeof meta.safety.flag === "string"
      ? meta.safety.flag
      : typeof meta.safety_flag === "string"
        ? meta.safety_flag
        : null;

  const safetyRiskScore =
    isRecord(meta.safety) && typeof meta.safety.risk_score === "number"
      ? meta.safety.risk_score
      : null;

  return {
    user_id: params.userId,
    session_id: params.sessionId,
    trace_id: traceId,
    global_state: globalState,
    overload_score: overloadScore,
    reflective_score: reflectiveScore,
    memory_pointer_count: memoryPointerCount,
    safety_flag: safetyFlag,
    safety_risk_score: safetyRiskScore,
    value_state: isRecord(meta.value) ? (meta.value.state ?? null) : null,
    trait_state: isRecord(meta.trait) ? (meta.trait.state ?? null) : null,
    meta,
    created_at: new Date().toISOString(),
  };
}

function wantsStream(req: NextRequest) {
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/event-stream")) return true;
  const url = new URL(req.url);
  return url.searchParams.get("stream") === "1";
}

// Character persona is injected via `persona_system` (system-side) to avoid dilution over long chats.

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params;
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "multipart/form-data required" },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const characterId = formData.get("characterId");
  const text = formData.get("text");
  if (
    typeof characterId !== "string" ||
    typeof text !== "string" ||
    !characterId ||
    !text.trim()
  ) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // accept and ignore files for now (Sigmaris core API is JSON-only)
  // const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  const supabase = await supabaseServer();

  // ownership check
  const { data: conv, error: convError } = await supabase
    .from("common_sessions")
    .select("id, chat_mode")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("app", "touhou")
    .maybeSingle();

  if (convError) {
    console.error("[touhou] conversation select error:", convError);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
  if (!conv) {
    return NextResponse.json(
      { error: "Conversation not found or forbidden" },
      { status: 403 }
    );
  }

  // store user message
  const { error: userInsertError } = await supabase
    .from("common_messages")
    .insert({
      session_id: sessionId,
      user_id: userId,
      app: "touhou",
      role: "user",
      content: text,
      speaker_id: null,
    });

  if (userInsertError) {
    console.error("[touhou] user message insert error:", userInsertError);
    return NextResponse.json(
      { error: "Failed to save user message" },
      { status: 500 }
    );
  }

  const base = coreBaseUrl();
  const chatModeRaw =
    conv && typeof (conv as Record<string, unknown>).chat_mode === "string"
      ? String((conv as Record<string, unknown>).chat_mode)
      : null;
  const chatMode: TouhouChatMode =
    chatModeRaw === "roleplay" || chatModeRaw === "coach" ? chatModeRaw : "partner";

  const personaSystem = buildTouhouPersonaSystem(characterId, { chatMode });
  const gen = genParamsFor(characterId);
  const streamMode = wantsStream(req);

  if (!streamMode) {
    const r = await fetch(`${base}/persona/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        session_id: sessionId,
        message: text.trim(),
        character_id: characterId,
        persona_system: personaSystem,
        gen,
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("[touhou] core /persona/chat failed:", r.status, detail);
      return NextResponse.json({ error: "Persona core failed" }, { status: 502 });
    }

    const data = (await r.json()) as PersonaChatResponse;
    const replySafe =
      typeof data.reply === "string" && data.reply.trim().length > 0
        ? data.reply
        : "（応答生成が一時的に利用できません。）";

    const { error: aiInsertError } = await supabase
      .from("common_messages")
      .insert({
        session_id: sessionId,
        user_id: userId,
        app: "touhou",
        role: "ai",
        content: replySafe,
        speaker_id: characterId,
        meta: data.meta ?? null,
      });

    if (aiInsertError) {
      console.error("[touhou] ai message insert error:", aiInsertError);
      return NextResponse.json(
        { error: "Failed to save ai message" },
        { status: 500 }
      );
    }

    if (isRecord(data.meta)) {
      try {
        await supabase.from("common_state_snapshots").insert([
          toStateSnapshotRow({
            userId,
            sessionId,
            meta: data.meta as Record<string, unknown>,
          }),
        ]);
      } catch (e) {
        console.warn("[touhou] state snapshot insert failed:", e);
      }
    }

    return NextResponse.json({
      role: "ai",
      content: replySafe,
      meta: data.meta ?? null,
    });
  }

  // ---- streaming: proxy SSE from Sigmaris core and persist on done ----
  const upstream = await fetch(`${base}/persona/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      session_id: sessionId,
      message: text.trim(),
      character_id: characterId,
      persona_system: personaSystem,
      gen,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error("[touhou] core stream failed:", upstream.status, detail);
    return NextResponse.json(
      { error: "Persona core stream failed", detail },
      { status: 502 }
    );
  }

  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  let replyAcc = "";
  let finalMeta: Record<string, unknown> | null = null;

  (async () => {
    let buf = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        while (true) {
          const idx = buf.indexOf("\n\n");
          if (idx === -1) break;
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);

          const lines = block.split("\n");
          let event = "message";
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          const dataRaw = dataLines.join("\n");

          if (event === "delta") {
            try {
                const parsed = JSON.parse(dataRaw);
                const textPart =
                  isRecord(parsed) && typeof parsed.text === "string"
                    ? parsed.text
                    : "";
                if (textPart) replyAcc += textPart;
                await writer.write(toSse("delta", { text: textPart }));
              } catch {
                await writer.write(`event: delta\ndata: ${dataRaw}\n\n`);
              }
            } else if (event === "done") {
              try {
                const parsed = JSON.parse(dataRaw);
                const reply =
                  isRecord(parsed) && typeof parsed.reply === "string"
                    ? parsed.reply
                    : replyAcc;

                finalMeta =
                  isRecord(parsed) && isRecord(parsed.meta) ? parsed.meta : null;
                replyAcc = reply;
                await writer.write(toSse("done", { reply, meta: finalMeta }));
              } catch {
                await writer.write(`event: done\ndata: ${dataRaw}\n\n`);
              }
          } else if (event === "start") {
            await writer.write(toSse("start", { sessionId }));
          } else if (event === "error") {
            await writer.write(toSse("error", { error: dataRaw }));
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await writer.write(toSse("error", { error: msg }));
    } finally {
      try {
        const replySafe =
          typeof replyAcc === "string" && replyAcc.trim().length > 0
            ? replyAcc
            : "（応答生成が一時的に利用できません。）";

        await supabase.from("common_messages").insert({
          session_id: sessionId,
          user_id: userId,
          app: "touhou",
          role: "ai",
          content: replySafe,
          speaker_id: characterId,
          meta: finalMeta ?? null,
        });
      } catch (e) {
        console.warn("[touhou] persist ai message failed:", e);
      }

      if (finalMeta) {
        try {
          await supabase.from("common_state_snapshots").insert([
            toStateSnapshotRow({ userId, sessionId, meta: finalMeta }),
          ]);
        } catch (e) {
          console.warn("[touhou] state snapshot insert failed:", e);
        }
      }

      try {
        await writer.close();
      } catch {
        // ignore
      }
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
