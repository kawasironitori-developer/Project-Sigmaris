export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import { getSupabaseServer } from "@/lib/supabaseServer";

type TraitTriplet = {
  calm: number;
  empathy: number;
  curiosity: number;
};

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
  provider: "web_search" | "github_repo_search";
  results: Array<Record<string, unknown>>;
};

function isTraitTriplet(v: any): v is TraitTriplet {
  return (
    v &&
    typeof v === "object" &&
    typeof v.calm === "number" &&
    typeof v.empathy === "number" &&
    typeof v.curiosity === "number"
  );
}

function coreBaseUrl() {
  const raw =
    process.env.SIGMARIS_CORE_URL ||
    process.env.NEXT_PUBLIC_SIGMARIS_CORE ||
    "http://127.0.0.1:8000";
  return String(raw).replace(/\/+$/, "");
}

function clampText(s: string, n: number) {
  const t = String(s ?? "");
  if (t.length <= n) return t;
  return t.slice(0, Math.max(0, n - 1)) + "...";
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
      out.push({
        type: "link_analysis",
        url,
        provider: "github_repo_search",
        results: Array.isArray(r.json?.results)
          ? (r.json?.results as Record<string, unknown>[])
          : [],
      });
      continue;
    }

    const r = await coreJson<{ ok?: boolean; results?: unknown[] }>({
      url: `${params.base}/io/web/search`,
      accessToken: params.accessToken,
      body: { query: url, max_results: 5 },
    });
    out.push({
      type: "link_analysis",
      url,
      provider: "web_search",
      results: Array.isArray(r.json?.results)
        ? (r.json?.results as Record<string, unknown>[])
        : [],
    });
  }

  return out;
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
      const top = (a.results ?? []).slice(0, 3);
      for (const r of top) {
        if (a.provider === "github_repo_search") {
          const owner = typeof (r as any)?.owner === "string" ? String((r as any).owner) : "";
          const name = typeof (r as any)?.name === "string" ? String((r as any).name) : "";
          const desc = typeof (r as any)?.description === "string" ? String((r as any).description) : "";
          const repoUrl =
            typeof (r as any)?.repository_url === "string"
              ? String((r as any).repository_url)
              : "";
          const label = [owner, name].filter(Boolean).join("/") || "(repo)";
          lines.push(
            `  - ${label}${desc ? ` — ${clampText(desc, 160)}` : ""}${repoUrl ? ` (${repoUrl})` : ""}`
          );
        } else {
          const title =
            typeof (r as any)?.title === "string" ? String((r as any).title) : "(result)";
          const snippet =
            typeof (r as any)?.snippet === "string" ? String((r as any).snippet) : "";
          const url2 = typeof (r as any)?.url === "string" ? String((r as any).url) : "";
          lines.push(
            `  - ${clampText(title, 120)}${snippet ? ` — ${clampText(snippet, 160)}` : ""}${url2 ? ` (${url2})` : ""}`
          );
        }
      }
    }
    msg += "\n\n" + lines.join("\n");
  }

  return clampText(msg, 12000);
}

/* -----------------------------------------------------
 * GET: セッションのメッセージ一覧（Supabase）
 * --------------------------------------------------- */
export async function GET(req: Request) {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) return NextResponse.json({ messages: [] });

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session");
    if (!sessionId) return NextResponse.json({ messages: [] });

    const supabase = getSupabaseServer();
    const { data } = await supabase
      .from("common_messages")
      .select("role, content, created_at")
      .eq("app", "sigmaris")
      .eq("user_id", user.id)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    const paired: { user: string; ai: string }[] = [];
    let tempUser: string | null = null;

    (data ?? []).forEach((m: any) => {
      if (m.role === "user") tempUser = m.content;
      else {
        paired.push({ user: tempUser ?? "", ai: m.content ?? "" });
        tempUser = null;
      }
    });

    if (tempUser !== null) paired.push({ user: tempUser, ai: "" });

    return NextResponse.json({ messages: paired });
  } catch {
    return NextResponse.json({ messages: [] }, { status: 500 });
  }
}

/* -----------------------------------------------------
 * POST: Persona OS backend (/persona/chat) に中継
 *   - 課金/クレジットの概念は扱わない（ログインのみ必須）
 * --------------------------------------------------- */
export async function POST(req: Request) {
  const step: any = { phase: "start" };

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let rawUserText = "";
    let lang: string | null = null;
    let files: File[] = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      rawUserText = String(form.get("text") ?? "").trim();
      lang = typeof form.get("lang") === "string" ? String(form.get("lang")) : null;
      files = form.getAll("files").filter((f): f is File => f instanceof File);
    } else {
      const body = (await req.json().catch(() => ({}))) as {
        text?: string;
        lang?: string;
      };
      rawUserText = String(body?.text ?? "").trim();
      lang = typeof body?.lang === "string" ? body.lang : null;
      files = [];
    }

    if (!rawUserText) {
      return NextResponse.json({ error: "Empty message", step }, { status: 400 });
    }

    const sessionId = req.headers.get("x-session-id") || randomUUID().toString();
    step.sessionId = sessionId;

    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized", step }, { status: 401 });
    }

    const {
      data: { session },
    } = await supabaseAuth.auth.getSession();
    const accessToken = session?.access_token ?? null;

    const supabase = getSupabaseServer();

    // --- load last trait baseline (stored in snapshot meta) ---
    let traitBaseline: TraitTriplet | null = null;
    try {
      const { data } = await supabase
        .from("common_state_snapshots")
        .select("meta, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const meta = (data ?? [])[0]?.meta ?? null;
      const b = meta?.trait?.baseline ?? null;
      traitBaseline = isTraitTriplet(b) ? b : null;
    } catch {
      traitBaseline = null;
    }

    const coreUrl = coreBaseUrl();
    step.coreUrl = coreUrl;

    const urls = extractUrls(rawUserText);
    const phase04Uploads = await uploadAndParseFiles({ base: coreUrl, accessToken, files });
    const phase04Links = await analyzeLinks({ base: coreUrl, accessToken, urls });
    const augmentedText = buildAugmentedMessage({
      userText: rawUserText,
      uploads: phase04Uploads,
      linkAnalyses: phase04Links,
    });
    const coreAttachments = [...phase04Uploads, ...phase04Links] as unknown as Record<
      string,
      unknown
    >[];

    const coreRes = await fetch(`${coreUrl}/persona/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        user_id: user.id,
        session_id: sessionId,
        message: augmentedText,
        trait_baseline: traitBaseline,
        meta: {
          client: "sigmaris-os",
          lang,
        },
        attachments: coreAttachments,
      }),
    });

    const coreJson = (await coreRes.json().catch(() => null)) as any;
    if (!coreRes.ok) {
      return NextResponse.json(
        {
          error: "Sigmaris core request failed",
          detail: coreJson,
          step,
        },
        { status: 502 }
      );
    }

    const reply: string =
      typeof coreJson?.reply === "string"
        ? coreJson.reply
        : "（応答の取得に失敗しました）";

    const meta = coreJson?.meta ?? null;

    // reply が空（content=null 等）になるケースがあるため、UIでの「不発」を避ける
    const replySafe =
      typeof reply === "string" && reply.trim().length > 0
        ? reply
        : "（応答生成が一時的に利用できません。）";
    const traitState: TraitTriplet | null = meta?.trait?.state ?? null;

    const now = new Date().toISOString();
    try {
      await supabase.from("common_messages").insert([
        {
          user_id: user.id,
          session_id: sessionId,
          app: "sigmaris",
          role: "user",
          content: rawUserText,
          created_at: now,
          meta: {
            phase04: {
              uploads: phase04Uploads,
              link_analyses: phase04Links,
            },
          },
        },
        {
          user_id: user.id,
          session_id: sessionId,
          app: "sigmaris",
          role: "ai",
          content: replySafe,
          created_at: now,
        },
      ]);
    } catch {
      await supabase.from("common_messages").insert([
        {
          user_id: user.id,
          session_id: sessionId,
          app: "sigmaris",
          role: "user",
          content: rawUserText,
          created_at: now,
        },
        {
          user_id: user.id,
          session_id: sessionId,
          app: "sigmaris",
          role: "ai",
          content: replySafe,
          created_at: now,
        },
      ]);
    }

    // Persona OS の内部状態（meta）を数値化して保存（ダッシュボード/グラフ用）
    try {
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
          created_at: now,
        },
      ]);

      // Phase01 Telemetry (C/N/M/S/R) - optional
      try {
        const tel = meta?.controller_meta?.telemetry ?? null;
        if (tel && typeof tel === "object") {
          await supabase.from("common_telemetry_snapshots").insert([
            {
              user_id: user.id,
              session_id: sessionId,
              trace_id: traceId,
              scores: tel?.scores ?? null,
              ema: tel?.ema ?? null,
              flags: tel?.flags ?? null,
              reasons: tel?.reasons ?? null,
              meta: tel,
              created_at: now,
            },
          ]);
        }
      } catch (e) {
        console.warn("[/api/aei] telemetry snapshot insert failed:", e);
      }

      // Phase02 Integration snapshots - optional
      try {
        const integ = meta?.controller_meta?.integration ?? null;
        if (integ && typeof integ === "object") {
          const temporal = (integ as any)?.temporal_identity ?? null;
          const subjectivity = (integ as any)?.subjectivity ?? null;
          const failure = (integ as any)?.failure ?? null;
          const identitySnapshot = (integ as any)?.identity_snapshot ?? null;
          const events = (integ as any)?.events ?? null;

          if (temporal && typeof temporal === "object") {
            await supabase.from("common_temporal_identity_snapshots").insert([
              {
                user_id: user.id,
                session_id: sessionId,
                trace_id: traceId,
                ego_id: typeof (temporal as any)?.ego_id === "string" ? (temporal as any).ego_id : null,
                state: temporal,
                telemetry: temporal,
                created_at: now,
              },
            ]);
          }

          if (subjectivity && typeof subjectivity === "object") {
            await supabase.from("common_subjectivity_snapshots").insert([
              {
                user_id: user.id,
                session_id: sessionId,
                trace_id: traceId,
                subjectivity,
                created_at: now,
              },
            ]);
          }

          if (failure && typeof failure === "object") {
            await supabase.from("common_failure_snapshots").insert([
              {
                user_id: user.id,
                session_id: sessionId,
                trace_id: traceId,
                failure,
                created_at: now,
              },
            ]);
          }

          if (identitySnapshot && typeof identitySnapshot === "object") {
            await supabase.from("common_identity_snapshots").insert([
              {
                user_id: user.id,
                session_id: sessionId,
                trace_id: traceId,
                snapshot: identitySnapshot,
                created_at: now,
              },
            ]);
          }

          if (Array.isArray(events) && events.length > 0) {
            await supabase.from("common_integration_events").insert(
              events.map((ev: any) => ({
                user_id: user.id,
                session_id: sessionId,
                trace_id: traceId,
                event_type: typeof ev?.event_type === "string" ? ev.event_type : "UNKNOWN",
                payload: ev ?? {},
                created_at: now,
              }))
            );
          }
        }
      } catch (e) {
        console.warn("[/api/aei] integration snapshot insert failed:", e);
      }
    } catch (e) {
      console.warn("[/api/aei] state snapshot insert failed:", e);
    }

    return NextResponse.json({
      success: true,
      sessionId,
      output: replySafe,
      traits: traitState ?? undefined,
      safety: meta?.safety ?? undefined,
      model: meta?.io?.model ?? process.env.SIGMARIS_PERSONA_MODEL ?? "sigmaris-core",
      python: meta ?? undefined,
    });
  } catch (err: any) {
    step.error = err?.message ?? String(err);
    return NextResponse.json({ error: "Internal Error", step }, { status: 500 });
  }
}
