export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import "server-only";

import { supabaseServer, requireUserId } from "@/lib/supabase-server";
import { buildTouhouPersonaSystem, genParamsFor, type TouhouChatMode } from "@/lib/touhouPersona";

type PersonaChatResponse = { reply: string; meta?: Record<string, unknown> };

type Phase04Attachment = {
  type: "upload";
  attachment_id: string;
  file_name: string;
  mime_type: string;
  kind: string;
  parsed_excerpt?: string;
};

type Phase04LinkAnalysis = {
  type: "link_analysis";
  url: string;
  provider: "web_fetch" | "web_search" | "github_repo_search";
  results: Array<{
    title?: string;
    snippet?: string;
    url?: string;
    repository_url?: string;
    name?: string;
    owner?: string;
  }>;
};

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

function clampText(s: string, n: number) {
  const t = String(s ?? "");
  if (t.length <= n) return t;
  return t.slice(0, Math.max(0, n - 1)) + "…";
}

function extractUrls(text: string): string[] {
  const t = String(text ?? "");
  const re = /https?:\/\/[^\s<>"')\]]+/g;
  const matches = t.match(re) ?? [];
  const uniq: string[] = [];
  for (const m of matches) {
    const u = String(m ?? "").trim();
    if (!u) continue;
    if (!uniq.includes(u)) uniq.push(u);
    if (uniq.length >= 3) break;
  }
  return uniq;
}

function containsAny(text: string, needles: string[]) {
  const t = String(text ?? "");
  return needles.some((n) => n && t.includes(n));
}

function detectAutoBrowse(text: string): { enabled: boolean; query: string; recency_days: number } {
  const t = String(text ?? "").trim();
  if (!t) return { enabled: false, query: "", recency_days: 7 };

  if ((process.env.SIGMARIS_AUTO_BROWSE_ENABLED ?? "").toLowerCase() === "0") {
    return { enabled: false, query: "", recency_days: 7 };
  }

  const optOut = [
    "検索しないで",
    "ネット見ないで",
    "ブラウズしないで",
    "推測でいい",
    "勘でいい",
    "オフラインで",
    "参照不要",
    "ソース不要",
  ];
  if (containsAny(t, optOut)) return { enabled: false, query: "", recency_days: 7 };

  const triggers = ["調べて", "検索", "探して", "ニュース", "速報", "ヘッドライン", "最新", "ソース", "出典", "根拠", "参照", "リンク"];
  if (!containsAny(t, triggers)) return { enabled: false, query: "", recency_days: 7 };

  const isNews = containsAny(t, ["ニュース", "速報", "ヘッドライン"]);
  const isRecent = containsAny(t, ["今日", "本日", "最新", "いま", "今"]);
  const recency_days = isNews || isRecent ? 1 : 30;

  // Use the user text as query; Serper supports natural queries.
  const q = clampText(t.replace(/\s+/g, " ").trim(), 240);
  return { enabled: true, query: q, recency_days };
}

function githubRepoQueryFromUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    if (u.hostname !== "github.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const owner = parts[0] ?? "";
    const repo = parts[1] ?? "";
    if (owner && repo) return `${repo} user:${owner}`;
    if (owner) return `user:${owner}`;
    return null;
  } catch {
    return null;
  }
}

async function coreJson<T>(params: {
  url: string;
  accessToken: string | null;
  body: unknown;
}): Promise<{ ok: boolean; status: number; json: T | null; text: string }> {
  const r = await fetch(params.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(params.accessToken ? { Authorization: `Bearer ${params.accessToken}` } : {}),
    },
    body: JSON.stringify(params.body),
  });
  const text = await r.text().catch(() => "");
  let json: T | null = null;
  try {
    json = text ? (JSON.parse(text) as T) : null;
  } catch {
    json = null;
  }
  return { ok: r.ok, status: r.status, json, text };
}

async function uploadAndParseFiles(params: {
  base: string;
  accessToken: string | null;
  files: File[];
}): Promise<Phase04Attachment[]> {
  const out: Phase04Attachment[] = [];

  for (const file of params.files.slice(0, 3)) {
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const up = await fetch(`${params.base}/io/upload`, {
        method: "POST",
        headers: {
          ...(params.accessToken ? { Authorization: `Bearer ${params.accessToken}` } : {}),
        },
        body: form,
      });
      if (!up.ok) continue;

      const upJson = (await up.json().catch(() => null)) as
        | { attachment_id?: unknown; file_name?: unknown; mime_type?: unknown }
        | null;
      const attachmentId = typeof upJson?.attachment_id === "string" ? upJson.attachment_id : null;
      if (!attachmentId) continue;

      const parsed = await coreJson<{ ok?: boolean; kind?: unknown; parsed?: unknown }>({
        url: `${params.base}/io/parse`,
        accessToken: params.accessToken,
        body: { attachment_id: attachmentId, kind: null },
      });
      const kind = typeof parsed.json?.kind === "string" ? parsed.json.kind : "unknown";

      const parsedAny = (parsed.json as any)?.parsed;
      const excerptCandidate =
        typeof parsedAny?.raw_excerpt === "string"
          ? parsedAny.raw_excerpt
          : typeof parsedAny?.text_excerpt === "string"
            ? parsedAny.text_excerpt
            : typeof parsedAny?.content_summary === "string"
              ? parsedAny.content_summary
              : typeof parsedAny?.excerpt_summary === "string"
                ? parsedAny.excerpt_summary
                : typeof parsedAny?.ocr?.detected_text === "string"
                  ? parsedAny.ocr.detected_text
              : "";

      out.push({
        type: "upload",
        attachment_id: attachmentId,
        file_name: typeof upJson?.file_name === "string" ? upJson.file_name : file.name,
        mime_type:
          typeof upJson?.mime_type === "string"
            ? upJson.mime_type
            : (file.type || "application/octet-stream"),
        kind,
        parsed_excerpt: excerptCandidate ? clampText(String(excerptCandidate), 1200) : undefined,
      });
    } catch {
      // ignore single-file failure
    }
  }

  return out;
}

async function analyzeLinks(params: {
  base: string;
  accessToken: string | null;
  urls: string[];
}): Promise<Phase04LinkAnalysis[]> {
  const out: Phase04LinkAnalysis[] = [];

  for (const url of params.urls.slice(0, 3)) {
    const ghQ = githubRepoQueryFromUrl(url);
    if (ghQ) {
      const r = await coreJson<{ ok?: boolean; results?: unknown[] }>({
        url: `${params.base}/io/github/repos`,
        accessToken: params.accessToken,
        body: { query: ghQ, max_results: 5 },
      });
      const results = Array.isArray(r.json?.results) ? (r.json?.results as any[]) : [];
      out.push({
        type: "link_analysis",
        url,
        provider: "github_repo_search",
        results: results.slice(0, 5).map((x) => ({
          name: typeof x?.name === "string" ? x.name : undefined,
          owner: typeof x?.owner === "string" ? x.owner : undefined,
          snippet: typeof x?.description === "string" ? x.description : undefined,
          repository_url: typeof x?.repository_url === "string" ? x.repository_url : undefined,
        })),
      });
      continue;
    }

    // Prefer /io/web/fetch for deeper content (allowlist + summarization). Fallback to web_search.
    const f = await coreJson<{
      ok?: boolean;
      title?: unknown;
      final_url?: unknown;
      summary?: unknown;
      text_excerpt?: unknown;
      key_points?: unknown;
      sources?: unknown[];
    }>({
      url: `${params.base}/io/web/fetch`,
      accessToken: params.accessToken,
      body: { url, summarize: true, max_chars: 12000 },
    });

    const fj = f.json;
    const fetchedSnippet =
      f.ok && fj
        ? typeof fj.summary === "string"
          ? String(fj.summary)
          : typeof fj.text_excerpt === "string"
            ? String(fj.text_excerpt)
            : ""
        : "";

    if (fetchedSnippet && fj) {
      const kp = Array.isArray(fj.key_points) ? (fj.key_points as any[]) : [];
      const title = typeof fj.title === "string" ? fj.title : "";
      const finalUrl = typeof fj.final_url === "string" ? fj.final_url : url;
      out.push({
        type: "link_analysis",
        url,
        provider: "web_fetch",
        results: [
          {
            title: title || undefined,
            snippet: clampText(fetchedSnippet, 600),
            url: finalUrl || url,
          },
          ...kp.slice(0, 3).map((x) => ({ snippet: clampText(String(x ?? ""), 160) })),
        ],
      });
      continue;
    }

    const r = await coreJson<{ ok?: boolean; results?: unknown[] }>({
      url: `${params.base}/io/web/search`,
      accessToken: params.accessToken,
      body: { query: url, max_results: 5 },
    });
    const results = Array.isArray(r.json?.results) ? (r.json?.results as any[]) : [];
    out.push({
      type: "link_analysis",
      url,
      provider: "web_search",
      results: results.slice(0, 5).map((x) => ({
        title: typeof x?.title === "string" ? x.title : undefined,
        snippet: typeof x?.snippet === "string" ? x.snippet : undefined,
        url: typeof x?.url === "string" ? x.url : undefined,
      })),
    });
  }

  return out;
}

async function autoBrowseFromText(params: {
  base: string;
  accessToken: string | null;
  userText: string;
}): Promise<Phase04LinkAnalysis[]> {
  const intent = detectAutoBrowse(params.userText);
  if (!intent.enabled) return [];

  const maxResultsRaw = Number(process.env.SIGMARIS_AUTO_BROWSE_MAX_RESULTS ?? "5");
  const maxResults = Number.isFinite(maxResultsRaw) ? Math.min(8, Math.max(1, maxResultsRaw)) : 5;

  const sr = await coreJson<{ ok?: boolean; results?: unknown[] }>({
    url: `${params.base}/io/web/search`,
    accessToken: params.accessToken,
    body: {
      query: intent.query,
      max_results: maxResults,
      recency_days: intent.recency_days,
      safe_search: true,
      domains: null,
    },
  });

  const results = Array.isArray(sr.json?.results) ? (sr.json?.results as any[]) : [];
  const top = results.slice(0, maxResults);

  const analyses: Phase04LinkAnalysis[] = [];
  analyses.push({
    type: "link_analysis",
    url: `query:${intent.query}`,
    provider: "web_search",
    results: top.map((x) => ({
      title: typeof x?.title === "string" ? x.title : undefined,
      snippet: typeof x?.snippet === "string" ? x.snippet : undefined,
      url: typeof x?.url === "string" ? x.url : undefined,
    })),
  });

  // Deep fetch a couple of URLs (allowlist enforced by core)
  const fetchTopRaw = Number(process.env.SIGMARIS_AUTO_BROWSE_FETCH_TOP ?? "2");
  const fetchTop = Number.isFinite(fetchTopRaw) ? Math.min(3, Math.max(0, fetchTopRaw)) : 2;

  const urls = top
    .map((x) => (typeof x?.url === "string" ? String(x.url) : ""))
    .filter(Boolean)
    .slice(0, fetchTop);

  const fetched = await analyzeLinks({ base: params.base, accessToken: params.accessToken, urls });
  return [...analyses, ...fetched];
}

function buildAugmentedMessage(params: {
  userText: string;
  uploads: Phase04Attachment[];
  linkAnalyses: Phase04LinkAnalysis[];
}) {
  let msg = String(params.userText ?? "").trim();

  if (params.uploads.length > 0) {
    const lines: string[] = [];
    lines.push("[添付ファイルの解析結果（自動）]");
    for (const a of params.uploads.slice(0, 3)) {
      const head = `- ${a.file_name} (${a.kind}, ${a.mime_type})`;
      const body = a.parsed_excerpt
        ? `  ${clampText(a.parsed_excerpt.replace(/\s+/g, " ").trim(), 900)}`
        : "";
      lines.push(body ? `${head}\n${body}` : head);
    }
    msg += "\n\n" + lines.join("\n");
  }

  if (params.linkAnalyses.length > 0) {
    const lines: string[] = [];
    lines.push("[リンク解析（自動）]");
    for (const a of params.linkAnalyses.slice(0, 3)) {
      lines.push(`- ${a.url}`);
      for (const r of (a.results ?? []).slice(0, 3)) {
        if (a.provider === "github_repo_search") {
          const label = [r.owner, r.name].filter(Boolean).join("/") || "(repo)";
          const desc = r.snippet ? ` — ${clampText(r.snippet, 160)}` : "";
          lines.push(
            `  - ${label}${desc}${r.repository_url ? ` (${r.repository_url})` : ""}`
          );
        } else {
          const title = r.title ? clampText(r.title, 120) : "(result)";
          const snip = r.snippet ? ` — ${clampText(r.snippet, 160)}` : "";
          lines.push(`  - ${title}${snip}${r.url ? ` (${r.url})` : ""}`);
        }
      }
    }
    msg += "\n\n" + lines.join("\n");
  }

  return clampText(msg, 12000);
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

  let accessToken: string | null = null;
  try {
    const sb = await supabaseServer();
    const {
      data: { session },
    } = await sb.auth.getSession();
    accessToken = session?.access_token ?? null;
  } catch {
    accessToken = null;
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

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const urls = extractUrls(text);

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

  const base = coreBaseUrl();
  const phase04Uploads = await uploadAndParseFiles({ base, accessToken, files });
  const phase04Links =
    urls.length > 0
      ? await analyzeLinks({ base, accessToken, urls })
      : await autoBrowseFromText({ base, accessToken, userText: text.trim() });
  const augmentedText = buildAugmentedMessage({
    userText: text.trim(),
    uploads: phase04Uploads,
    linkAnalyses: phase04Links,
  });
  const coreAttachments = [...phase04Uploads, ...phase04Links] as unknown as Record<
    string,
    unknown
  >[];

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
      meta: {
        phase04: {
          uploads: phase04Uploads,
          link_analyses: phase04Links,
        },
      },
    });

  if (userInsertError) {
    console.error("[touhou] user message insert error:", userInsertError);
    return NextResponse.json(
      { error: "Failed to save user message" },
      { status: 500 }
    );
  }

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
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        user_id: userId,
        session_id: sessionId,
        message: augmentedText,
        character_id: characterId,
        persona_system: personaSystem,
        gen,
        attachments: coreAttachments,
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
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      user_id: userId,
      session_id: sessionId,
      message: augmentedText,
      character_id: characterId,
      persona_system: personaSystem,
      gen,
      attachments: coreAttachments,
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
