export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import { getSupabaseServer } from "@/lib/supabaseServer";

type TraitTriplet = { calm: number; empathy: number; curiosity: number };

type Phase04AutoSource = {
  type: "auto_browse";
  query: string;
  recency_days: number;
  results: Array<{ title?: string; url?: string; snippet?: string }>;
  fetched: Array<{ url: string; final_url?: string; title?: string; summary?: string; text_excerpt?: string }>;
};

function coreBaseUrl() {
  const raw =
    process.env.SIGMARIS_CORE_URL ||
    process.env.NEXT_PUBLIC_SIGMARIS_CORE ||
    "http://127.0.0.1:8000";
  return String(raw).replace(/\/+$/, "");
}

function enforceOrigin(req: Request) {
  const allowedRaw = String(process.env.SIGMARIS_ALLOWED_ORIGINS ?? "").trim();
  const reqOrigin = req.headers.get("origin");
  const sameOrigin = new URL(req.url).origin;

  if (!reqOrigin) return;

  const allowed = allowedRaw
    ? allowedRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [sameOrigin];

  if (!allowed.includes(reqOrigin)) {
    throw new Error(`Origin not allowed: ${reqOrigin}`);
  }
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

function clampText(s: string, n: number) {
  const t = String(s ?? "");
  if (t.length <= n) return t;
  return t.slice(0, Math.max(0, n - 1)) + "...";
}

function containsAny(text: string, needles: string[]) {
  const t = String(text ?? "");
  return needles.some((n) => n && t.includes(n));
}

function extractTheme(text: string): string | null {
  const t = String(text ?? "");
  const m =
    t.match(/(?:テーマは|テーマ[:：]|topic[:：]?)\s*([^\n。]+)\s*/i) ??
    t.match(/(?:テーマ|topic)\s*=\s*([^\n。]+)\s*/i);
  const v = m && typeof m[1] === "string" ? m[1].trim() : "";
  return v ? v.slice(0, 120) : null;
}

function defaultNewsDomains(): string[] {
  const env = String(process.env.SIGMARIS_AUTO_BROWSE_NEWS_DOMAINS ?? "").trim();
  if (env) return env.split(",").map((x) => x.trim()).filter(Boolean);
  return [
    "nhk.or.jp",
    "nikkei.com",
    "asahi.com",
    "yomiuri.co.jp",
    "mainichi.jp",
    "jiji.com",
    "kyodonews.jp",
    "itmedia.co.jp",
    "impress.co.jp",
    "reuters.com",
  ];
}

function detectAutoBrowse(text: string): {
  enabled: boolean;
  query: string;
  recency_days: number;
  domains: string[] | null;
} {
  const t = String(text ?? "").trim();
  if (!t) return { enabled: false, query: "", recency_days: 7, domains: null };

  if ((process.env.SIGMARIS_AUTO_BROWSE_ENABLED ?? "").toLowerCase() === "0") {
    return { enabled: false, query: "", recency_days: 7, domains: null };
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
  if (containsAny(t, optOut)) return { enabled: false, query: "", recency_days: 7, domains: null };

  const triggers = [
    "調べて",
    "検索",
    "探して",
    "ニュース",
    "速報",
    "ヘッドライン",
    "最新",
    "ソース",
    "出典",
    "根拠",
    "参照",
    "リンク",
  ];
  if (!containsAny(t, triggers)) return { enabled: false, query: "", recency_days: 7, domains: null };

  const isNews = containsAny(t, ["ニュース", "速報", "ヘッドライン", "記事"]);
  const isRecent = containsAny(t, ["今日", "本日", "最新", "いま", "今"]);
  const recency_days = isNews || isRecent ? 1 : 30;

  const theme = extractTheme(t);
  const wantsAI =
    containsAny(t, ["AI", "生成AI", "LLM", "ChatGPT", "エージェント"]) ||
    (theme ? containsAny(theme, ["AI", "生成AI", "LLM", "ChatGPT"]) : false);
  const wantsJapan =
    containsAny(t, ["日本", "国内", "jp", "JAPAN"]) || (theme ? containsAny(theme, ["日本", "国内"]) : false);

  const tokens: string[] = [];
  if (isRecent) tokens.push("今日");
  if (wantsJapan) tokens.push("日本");
  if (wantsAI) tokens.push("AI");
  if (theme && theme.length > 0) tokens.push(theme);
  if (isNews) tokens.push("ニュース");

  const q = clampText(t.replace(/\s+/g, " ").trim(), 240);
  const baseQ = tokens.length > 0 ? tokens.join(" ") : q;
  const domains = isNews ? defaultNewsDomains() : null;
  return { enabled: true, query: clampText(baseQ, 240), recency_days, domains };
}

async function coreJson<T>(params: {
  url: string;
  accessToken: string | null;
  body: unknown;
}): Promise<{ ok: boolean; status: number; json: T | null }> {
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
  return { ok: r.ok, status: r.status, json };
}

function buildAugmentedMessage(params: {
  userText: string;
  source: Phase04AutoSource | null;
}) {
  let msg = String(params.userText ?? "").trim();
  const s = params.source;
  if (!s) return msg;

  const lines: string[] = [];
  lines.push("[リンク解析（自動）]");
  lines.push("※このブロックはサーバー側でWeb検索/取得した結果です。根拠として使えます。");
  lines.push(`- query: ${s.query} (recency_days=${s.recency_days})`);
  for (const r of (s.results ?? []).slice(0, 5)) {
    const title = r.title ? clampText(String(r.title), 120) : "(result)";
    const snip = r.snippet ? ` — ${clampText(String(r.snippet), 160)}` : "";
    const u = r.url ? ` (${String(r.url)})` : "";
    lines.push(`  - ${title}${snip}${u}`);
  }
  for (const f of (s.fetched ?? []).slice(0, 2)) {
    const u = f.final_url || f.url;
    const title = f.title ? clampText(String(f.title), 120) : "(fetched)";
    const snip = f.summary || f.text_excerpt || "";
    lines.push(`  - [fetched] ${title}${snip ? ` — ${clampText(String(snip), 180)}` : ""} (${u})`);
  }

  msg += "\n\n" + lines.join("\n");
  return clampText(msg, 12000);
}

function retrievalSystemHint(params: { enabled: boolean }) {
  if (!params.enabled) return "";
  return [
    "Retrieval Mode: ON",
    "- Web retrieval results may be provided in the user message under [リンク解析（自動）].",
    "- If that block exists, do NOT claim you cannot browse the web. Use the provided results.",
    "- When you reference facts from the results, include the URL shown in parentheses as the source.",
  ].join("\n");
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
  try {
    enforceOrigin(req);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabaseAuth = createRouteHandlerClient({ cookies });
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Basic per-user rate limit (best-effort).
  const minIntervalMsRaw = Number(process.env.SIGMARIS_RATE_LIMIT_MS ?? "800");
  const minIntervalMs = Number.isFinite(minIntervalMsRaw)
    ? Math.max(0, Math.min(60_000, minIntervalMsRaw))
    : 800;
  if (minIntervalMs > 0) {
    try {
      const sb = getSupabaseServer();
      const { data } = await sb
        .from("common_messages")
        .select("created_at")
        .eq("user_id", user.id)
        .eq("app", "sigmaris")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastIso = (data as any)?.created_at;
      const lastTs = typeof lastIso === "string" ? Date.parse(lastIso) : NaN;
      if (Number.isFinite(lastTs) && Date.now() - lastTs < minIntervalMs) {
        return NextResponse.json(
          { error: "Rate limited" },
          { status: 429, headers: { "Retry-After": String(Math.ceil(minIntervalMs / 1000)) } }
        );
      }
    } catch {
      // ignore
    }
  }

  const {
    data: { session },
  } = await supabaseAuth.auth.getSession();
  const accessToken = session?.access_token ?? null;

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

  // Natural language auto-browse (no URL required). 1-shot per request, bounded.
  let autoSource: Phase04AutoSource | null = null;
  try {
    const intent = detectAutoBrowse(rawUserText);
    if (intent.enabled) {
      const maxResultsRaw = Number(process.env.SIGMARIS_AUTO_BROWSE_MAX_RESULTS ?? "5");
      const maxResults = Number.isFinite(maxResultsRaw) ? Math.min(8, Math.max(1, maxResultsRaw)) : 5;

      const sr = await coreJson<{ ok?: boolean; results?: any[] }>({
        url: `${coreUrl}/io/web/search`,
        accessToken,
        body: {
          query: intent.query,
          max_results: maxResults,
          recency_days: intent.recency_days,
          safe_search: "active",
          domains: intent.domains,
        },
      });
      const results = Array.isArray(sr.json?.results) ? (sr.json?.results as any[]) : [];

      const fetchTopRaw = Number(process.env.SIGMARIS_AUTO_BROWSE_FETCH_TOP ?? "2");
      const fetchTop = Number.isFinite(fetchTopRaw) ? Math.min(3, Math.max(0, fetchTopRaw)) : 2;
      const urls = results
        .map((x) => (typeof x?.url === "string" ? String(x.url) : ""))
        .filter(Boolean)
        .slice(0, fetchTop);

      const fetched: Phase04AutoSource["fetched"] = [];
      for (const u of urls) {
        const fr = await coreJson<{
          ok?: boolean;
          url?: unknown;
          final_url?: unknown;
          title?: unknown;
          summary?: unknown;
          text_excerpt?: unknown;
        }>({
          url: `${coreUrl}/io/web/fetch`,
          accessToken,
          body: { url: u, summarize: true, max_chars: 12000 },
        });
        if (fr.ok && fr.json) {
          fetched.push({
            url: typeof fr.json.url === "string" ? fr.json.url : u,
            final_url: typeof fr.json.final_url === "string" ? fr.json.final_url : undefined,
            title: typeof fr.json.title === "string" ? fr.json.title : undefined,
            summary: typeof fr.json.summary === "string" ? fr.json.summary : undefined,
            text_excerpt: typeof fr.json.text_excerpt === "string" ? fr.json.text_excerpt : undefined,
          });
        }
      }

      autoSource = {
        type: "auto_browse",
        query: intent.query,
        recency_days: intent.recency_days,
        results: results.slice(0, maxResults).map((x) => ({
          title: typeof x?.title === "string" ? x.title : undefined,
          url: typeof x?.url === "string" ? x.url : undefined,
          snippet: typeof x?.snippet === "string" ? x.snippet : undefined,
        })),
        fetched,
      };
    }
  } catch {
    autoSource = null;
  }

  const augmentedText = buildAugmentedMessage({ userText: rawUserText, source: autoSource });
  const retrievalHint = retrievalSystemHint({ enabled: Boolean(autoSource) });
  const attachments = autoSource ? ([autoSource] as any) : null;

  const supabase = getSupabaseServer();

  let coreHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
  try {
    const { data } = await supabase
      .from("common_messages")
      .select("role, content, created_at")
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .eq("app", "sigmaris")
      .order("created_at", { ascending: false })
      .limit(16);

    const rows = Array.isArray(data) ? (data as any[]) : [];
    coreHistory = rows
      .map((r) => {
        const roleRaw = typeof r?.role === "string" ? String(r.role) : "";
        const content = typeof r?.content === "string" ? String(r.content) : "";
        const role = roleRaw === "user" ? "user" : roleRaw === "ai" ? "assistant" : null;
        if (!role || !content.trim()) return null;
        return { role, content };
      })
      .filter(Boolean) as Array<{ role: "user" | "assistant"; content: string }>;
    coreHistory = coreHistory.reverse();
  } catch {
    coreHistory = [];
  }

  const upstream = await fetch(`${coreUrl}/persona/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      user_id: user.id,
      session_id: sessionId,
      message: augmentedText,
      history: coreHistory,
      trait_baseline: traitBaseline,
      reward_signal: typeof body.reward_signal === "number" ? body.reward_signal : 0.0,
      affect_signal: body.affect_signal ?? null,
      persona_system: retrievalHint ? `# Retrieval\n${retrievalHint}` : null,
      attachments,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json(
      { error: "Sigmaris core stream failed", detail },
      { status: 502 }
    );
  }

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
        meta: autoSource ? { phase04: { auto_browse: autoSource } } : null,
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
            ? replyAcc
            : "（応答生成が一時的に利用できません。）";

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
