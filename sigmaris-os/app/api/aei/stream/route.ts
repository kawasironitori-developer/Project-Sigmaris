export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import { getSupabaseServer } from "@/lib/supabaseServer";

type TraitTriplet = { calm: number; empathy: number; curiosity: number };

function coreBaseUrl() {
  const raw =
    process.env.SIGMARIS_CORE_URL ||
    process.env.NEXT_PUBLIC_SIGMARIS_CORE ||
    "http://127.0.0.1:8000";
  return String(raw).replace(/\/+$/, "");
}

function isTraitTriplet(v: any): v is TraitTriplet {
  return (
    v &&
    typeof v === "object" &&
    typeof v.calm === "number" &&
    typeof v.empathy === "number" &&
    typeof v.curiosity === "number"
  );
}

function toSse(event: string, data: any) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function readLastBaseline(userId: string): Promise<TraitTriplet | null> {
  try {
    const supabase = getSupabaseServer();
    const { data } = await supabase
      .from("common_state_snapshots")
      .select("meta, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);
    const meta = (data ?? [])[0]?.meta ?? null;
    const b = meta?.trait?.baseline ?? null;
    return isTraitTriplet(b) ? b : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const supabaseAuth = createRouteHandlerClient({ cookies });
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    text?: string;
    lang?: string;
    reward_signal?: number;
    affect_signal?: Record<string, number>;
  };

  const rawUserText = String(body?.text ?? "").trim();
  if (!rawUserText) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }

  const sessionId = req.headers.get("x-session-id") || randomUUID().toString();
  const traitBaseline = await readLastBaseline(user.id);

  const coreUrl = coreBaseUrl();
  const upstream = await fetch(`${coreUrl}/persona/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: user.id,
      session_id: sessionId,
      message: rawUserText,
      trait_baseline: traitBaseline,
      reward_signal: typeof body.reward_signal === "number" ? body.reward_signal : 0.0,
      affect_signal: body.affect_signal ?? null,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json(
      { error: "Sigmaris core stream failed", detail },
      { status: 502 }
    );
  }

  const supabase = getSupabaseServer();
  const now = new Date().toISOString();
  // store user message early (AI message and snapshots stored on done)
  try {
    await supabase.from("common_messages").insert([
      {
        user_id: user.id,
        session_id: sessionId,
        app: "sigmaris",
        role: "user",
        content: rawUserText,
        created_at: now,
      },
    ]);
  } catch {
    // ignore
  }

  let replyAcc = "";
  let finalMeta: any = null;

  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

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
              const text = typeof parsed?.text === "string" ? parsed.text : "";
              replyAcc += text;
              await writer.write(toSse("delta", { text }));
            } catch {
              // passthrough
              await writer.write(`event: delta\ndata: ${dataRaw}\n\n`);
            }
          } else if (event === "done") {
            try {
              const parsed = JSON.parse(dataRaw);
              const reply = typeof parsed?.reply === "string" ? parsed.reply : replyAcc;
              finalMeta = parsed?.meta ?? null;
              replyAcc = reply;
              await writer.write(toSse("done", { reply, meta: finalMeta }));
            } catch {
              await writer.write(`event: done\ndata: ${dataRaw}\n\n`);
            }
          } else if (event === "error") {
            await writer.write(toSse("error", { error: dataRaw }));
          } else if (event === "start") {
            await writer.write(toSse("start", { sessionId }));
          } else {
            await writer.write(`event: ${event}\ndata: ${dataRaw}\n\n`);
          }
        }
      }
    } catch (e: any) {
      await writer.write(toSse("error", { error: e?.message ?? String(e) }));
    } finally {
      try {
        // persist AI message + snapshot if we have meta
        const now2 = new Date().toISOString();
        const replySafe =
          typeof replyAcc === "string" && replyAcc.trim().length > 0
            ? replyAcc : "（応答生成が一時的に利用できません。）" /*
            : "（応答生成が一時的に利用できません。）";

        */;

        await supabase.from("common_messages").insert([
          {
            user_id: user.id,
            session_id: sessionId,
            app: "sigmaris",
            role: "ai",
            content: replySafe,
            created_at: now2,
          },
        ]);

        if (finalMeta) {
          const meta = finalMeta;
          const traceId: string | null =
            typeof meta?.trace_id === "string" ? meta.trace_id : null;
          const globalState: string | null =
            typeof meta?.global_state?.state === "string" ? meta.global_state.state : null;
          const overloadScore: number | null =
            typeof meta?.controller_meta?.overload_score === "number"
              ? meta.controller_meta.overload_score
              : typeof meta?.global_state?.meta?.overload_score === "number"
                ? meta.global_state.meta.overload_score
                : null;
          const reflectiveScore: number | null =
            typeof meta?.global_state?.meta?.reflective_score === "number"
              ? meta.global_state.meta.reflective_score
              : null;
          const memoryPointerCount: number | null =
            typeof meta?.controller_meta?.memory?.pointer_count === "number"
              ? meta.controller_meta.memory.pointer_count
              : typeof meta?.memory?.initial_pointer_count === "number"
                ? meta.memory.initial_pointer_count
                : null;
          const safetyFlag: string | null =
            typeof meta?.safety?.flag === "string"
              ? meta.safety.flag
              : typeof meta?.controller_meta?.safety_flag === "string"
                ? meta.controller_meta.safety_flag
                : typeof meta?.global_state?.meta?.safety_flag === "string"
                  ? meta.global_state.meta.safety_flag
                  : null;
          const safetyRiskScore: number | null =
            typeof meta?.safety?.risk_score === "number" ? meta.safety.risk_score : null;

          await supabase.from("common_state_snapshots").insert([
            {
              user_id: user.id,
              session_id: sessionId,
              trace_id: traceId,
              global_state: globalState,
              overload_score: overloadScore,
              reflective_score: reflectiveScore,
              memory_pointer_count: memoryPointerCount,
              safety_flag: safetyFlag,
              safety_risk_score: safetyRiskScore,
              value_state: meta?.value?.state ?? null,
              trait_state: meta?.trait?.state ?? null,
              meta,
              created_at: now2,
            },
          ]);
        }
      } catch {
        // ignore persistence errors
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
