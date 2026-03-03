export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import "server-only";

import { supabaseServer, requireUserId } from "@/lib/supabase-server";
import { buildTouhouPersonaSystem, genParamsFor, type TouhouChatMode } from "@/lib/touhouPersona";

type PersonaChatResponse = { reply: string; meta?: Record<string, unknown> };

type PersonaIntentLabel =
  | "banter"
  | "chitchat"
  | "advice"
  | "task"
  | "incident"
  | "lore"
  | "roleplay_scene"
  | "meta"
  | "safety"
  | "unclear";

type PersonaOutputStyle = "normal" | "bullet_3" | "choice_2";
type PersonaUrgency = "low" | "normal" | "high";
type PersonaSafetyRisk = "none" | "low" | "med" | "high";

type PersonaIntentResponse = {
  intent: PersonaIntentLabel;
  confidence: number;
  output_style: PersonaOutputStyle;
  allowed_humor: boolean;
  urgency: PersonaUrgency;
  needs_clarify: boolean;
  clarify_question: string;
  safety_risk: PersonaSafetyRisk;
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

function shouldUseDirectorOverlay(params: { characterId: string; chatMode: TouhouChatMode }) {
  return params.chatMode === "roleplay" && params.characterId === "reimu";
}

async function fetchPersonaIntent(params: {
  base: string;
  accessToken: string | null;
  sessionId: string;
  characterId: string;
  chatMode: TouhouChatMode;
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<PersonaIntentResponse | null> {
  try {
    const r = await fetch(`${params.base}/persona/intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(params.accessToken ? { Authorization: `Bearer ${params.accessToken}` } : {}),
      },
      body: JSON.stringify({
        session_id: params.sessionId,
        character_id: params.characterId,
        chat_mode: params.chatMode,
        message: params.message,
        history: params.history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as unknown;
    if (!isRecord(data)) return null;
    if (typeof data.intent !== "string" || typeof data.output_style !== "string") return null;
    return data as PersonaIntentResponse;
  } catch {
    return null;
  }
}

function effectiveOutputStyle(intent: PersonaIntentResponse): PersonaOutputStyle {
  // Hard rule: if clarification is needed, force a single clarify question (paragraph style).
  return intent.needs_clarify ? "normal" : intent.output_style;
}

function outputStyleBlock(style: PersonaOutputStyle, intent: PersonaIntentResponse): string {
  if (intent.needs_clarify) {
    return [
      "# Output style (FORCED)",
      "- このターンは「確認質問を1つだけ」出して止める（助言/煽り/賽銭/長文は禁止）。",
      "- 文は短く、最後は必ず「？」で終える。",
    ].join("\n");
  }
  if (style === "bullet_3") {
    return [
      "# Output style (FORCED)",
      "- 返信は「- 」で始まる箇条書きちょうど3行のみ。",
      "- 空行や4行目は禁止。各行は短く。",
    ].join("\n");
  }
  if (style === "choice_2") {
    return [
      "# Output style (FORCED)",
      "- 返信は2行のみ。",
      "- 1行目は必ず「A)」で開始、2行目は必ず「B)」で開始。",
      "- それ以外の行（前置き/後置き/空行）は禁止。",
    ].join("\n");
  }
  return [
    "# Output style (FORCED)",
    "- 1〜7文（短め）。長文/解説は禁止。",
    "- 箇条書き/候補列挙は最大3つまで（それ以上は1文でまとめる）。",
  ].join("\n");
}

function reimuDirectorOverlay(intent: PersonaIntentResponse): string {
  const style = effectiveOutputStyle(intent);
  const base: string[] = [
    "# Director overlay (Reimu, per-turn)",
    `- intent: ${intent.intent}`,
    `- confidence: ${Number.isFinite(intent.confidence) ? intent.confidence.toFixed(2) : "0.00"}`,
    `- urgency: ${intent.urgency}`,
    `- allowed_humor: ${intent.allowed_humor ? "true" : "false"}`,
    `- safety_risk: ${intent.safety_risk}`,
    "",
    outputStyleBlock(style, intent),
    "",
    "# Behavior (FORCED)",
    "- ユーザーの精神状態を推測/分析して断定しない（心理分析っぽい説明は禁止）。",
    "- 余計な一言（決め台詞の暴発）を入れない。脈絡がある時だけ言う。",
  ];

  if (intent.intent === "meta") {
    base.push(
      "",
      "# Meta handling (FORCED)",
      "- AI/プロンプト/システム等の話題は短く拒否し、霊夢として会話に戻す。",
      "- 説明や講義は禁止。短く切って質問で戻す。",
    );
  } else if (intent.intent === "safety") {
    base.push(
      "",
      "# Safety handling (FORCED)",
      "- 安全ポリシーに従い、危険な依頼は拒否する。",
      "- 霊夢として短く受け、代替の安全な選択肢を最小限で提示して質問で止める。",
    );
  } else if (intent.intent === "incident") {
    base.push(
      "",
      "# Incident handling",
      "- 「また異変？」の低テンションから入って、最小3手で片付け方を出す。",
      "- 断言しすぎない。足りない情報は質問1つで補う。",
      "- 原因候補の列挙は最大3つまで（長い羅列・番号リスト禁止）。",
    );
  } else if (intent.intent === "lore") {
    base.push(
      "",
      "# Lore handling",
      "- 知ってる範囲だけ。曖昧なら霊夢口調で濁す（捏造しない）。",
      "- 1刺しまでの皮肉はOK。ただし講釈はしない。",
    );
  } else if (intent.intent === "roleplay_scene") {
    base.push(
      "",
      "# Roleplay scene handling",
      "- 情景は短く。地の文で長く語らない。",
      "- 会話を前に進める質問で止める。",
    );
  } else if (intent.intent === "task" || intent.intent === "advice") {
    base.push(
      "",
      "# Advice/task handling",
      "- 実務的に。3手まで。感情の断定/心理分析/長文はしない。",
      "- 候補列挙や手順は最大3つ。4つ以上は出さない。",
      "- 質問は1つだけ。心情の二択/三択で分類させない（事実を1つ聞く）。",
    );
  } else if (intent.intent === "banter") {
    base.push(
      "",
      "# Banter handling",
      "- 軽い皮肉はOK（1刺しまで）。追撃しない。粘着しない。",
      "- 相手が不快になりそうなら即引く（allowed_humor=false の時は煽り禁止）。",
    );
  } else {
    base.push(
      "",
      "# Default handling",
      "- 受け→短い確認→必要なら最小3手→質問で止める。",
    );
  }

  if (!intent.allowed_humor) {
    base.push("", "# Humor gate (FORCED)", "- このターンは冗談/煽り/賽銭の小突きは入れない。");
  }

  if (intent.needs_clarify && (intent.clarify_question || "").trim()) {
    base.push("", "# Clarify question (FORCED)", `- 出力する質問はこれ：${intent.clarify_question.trim()}`);
  }

  return base.join("\n").trim();
}

function lintOutputStyle(params: {
  style: PersonaOutputStyle;
  intent: PersonaIntentResponse | null;
  reply: string;
}): { ok: boolean; reason: string } {
  const raw = String(params.reply ?? "").trim();
  if (!raw) return { ok: false, reason: "empty" };

  // Clarify mode: exactly one question, no extra content.
  if (params.intent?.needs_clarify) {
    const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    const joined = lines.join(" ");
    const qCount = (joined.match(/[？?]/g) ?? []).length;
    if (qCount !== 1) return { ok: false, reason: "clarify_question_count" };
    if (!/[？?]\s*$/.test(joined)) return { ok: false, reason: "clarify_not_question_end" };
    // discourage bullets/choices in clarify mode
    if (lines.some((l) => l.startsWith("- ") || l.startsWith("A)") || l.startsWith("B)"))) {
      return { ok: false, reason: "clarify_has_format" };
    }
    return { ok: true, reason: "" };
  }

  if (params.style === "bullet_3") {
    const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length !== 3) return { ok: false, reason: "bullet_line_count" };
    if (!lines.every((l) => l.startsWith("- ") && l.length > 2)) return { ok: false, reason: "bullet_prefix" };
    return { ok: true, reason: "" };
  }

  if (params.style === "choice_2") {
    const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length !== 2) return { ok: false, reason: "choice_line_count" };
    if (!lines[0].startsWith("A)")) return { ok: false, reason: "choice_a" };
    if (!lines[1].startsWith("B)")) return { ok: false, reason: "choice_b" };
    return { ok: true, reason: "" };
  }

  // normal
  const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  if (params.intent?.intent === "safety") {
    // Safety replies may include resources; do not enforce brevity/question-ending.
    if (lines.length > 40) return { ok: false, reason: "normal_too_long" };
    return { ok: true, reason: "" };
  }
  if (lines.length > 10) return { ok: false, reason: "normal_too_long" };
  return { ok: true, reason: "" };
}

function coerceToForcedStyle(params: {
  style: PersonaOutputStyle;
  intent: PersonaIntentResponse;
  reply: string;
}): { reply: string; applied: boolean } {
  const style = params.style;
  const raw = String(params.reply ?? "").trim();
  if (!raw) return { reply: raw, applied: false };

  if (params.intent.needs_clarify && (params.intent.clarify_question || "").trim()) {
    return { reply: String(params.intent.clarify_question).trim(), applied: true };
  }

  if (style === "normal") {
    const lines = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length > 10) {
      const compact = lines.join(" ").replace(/\s+/g, " ").trim();
      return { reply: compact, applied: compact !== raw };
    }
    return { reply: raw, applied: false };
  }

  if (style === "bullet_3") {
    const lines = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const bullets = lines.filter((l) => l.startsWith("- ")).map((l) => l.replace(/\s+/g, " ").trim());
    const picked = (bullets.length ? bullets : lines)
      .join(" ")
      .split(/[。！？?!\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (picked.length === 3) {
      return { reply: picked.map((t) => (t.startsWith("- ") ? t : `- ${t}`)).join("\n"), applied: true };
    }
    return { reply: raw, applied: false };
  }

  if (style === "choice_2") {
    const lines = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const a = lines.find((l) => l.startsWith("A)")) ?? null;
    const b = lines.find((l) => l.startsWith("B)")) ?? null;
    if (a && b) return { reply: `${a}\n${b}`, applied: true };

    const picked = lines
      .join(" ")
      .split(/[。！？?!\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 2);
    if (picked.length === 2) return { reply: `A) ${picked[0]}\nB) ${picked[1]}`, applied: true };
    return { reply: raw, applied: false };
  }

  return { reply: raw, applied: false };
}

/* =========================================================
 * Contextual phrase guards
 * - Prevent “決め台詞の脈絡なし注入” across characters
 * - Apply minimal, conservative replacements to avoid breaking meaning
 * ========================================================= */

function isFirstAssistantTurn(history: Array<{ role: "user" | "assistant"; content: string }>) {
  return !history.some((m) => m.role === "assistant" && String(m.content ?? "").trim());
}

function buildRecentUserText(params: {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  currentUserText: string;
}) {
  const parts: string[] = [];
  const recentUsers = params.history
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => String(m.content ?? ""));
  parts.push(...recentUsers);
  parts.push(String(params.currentUserText ?? ""));
  return parts.join("\n").toLowerCase();
}

function sanitizeReplyByContext(params: {
  characterId: string;
  chatMode: TouhouChatMode;
  reply: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  currentUserText: string;
}) {
  let out = String(params.reply ?? "");
  if (!out.trim()) return out;

  const lowerRecentUser = buildRecentUserText({
    history: params.history,
    currentUserText: params.currentUserText,
  });

  // 1) Generic: avoid “ユーザー発話の分類説明” (AI臭)
  // Example: 「元気？」は、あいさつ。それともちゃんと調子チェック。
  out = out.replace(
    /「[^」]{1,40}」は、?\s*(?:あいさつ|挨拶|調子チェック)[^。\n]*[。\n]?/g,
    "",
  );

  // 2) Koishi: “みつけた / やっほー” are strong openers; don't inject without context
  if (params.chatMode === "roleplay" && params.characterId === "koishi") {
    const allowMitsuketa =
      isFirstAssistantTurn(params.history) ||
      /みつけ|見つけ|探|かくれんぼ|どこ|いる|気づ/i.test(lowerRecentUser);

    if (!allowMitsuketa) {
      // Remove sentence-start “みつけた” (no replacement; avoid extra filler).
      out = out.replace(/(^|\n)\s*みつけた[。！!…]*\s*/g, "$1");
    }

    const allowYahho =
      isFirstAssistantTurn(params.history) ||
      /やっほ|こんにちは|こんちは|はじめまして|雑談|話そ|話す/i.test(lowerRecentUser);
    if (!allowYahho) {
      // Remove sentence-start “やっほー” (no replacement; avoid extra filler).
      out = out.replace(/(^|\n)\s*…{2,}やっほー[。！!…]*\s*/g, "$1");
      out = out.replace(/(^|\n)\s*やっほー[。！!…]*\s*/g, "$1");
    }
  }

  // 3) Reimu: keep light jokes, but remove harsh coercion around “賽銭”.
  if (params.chatMode === "roleplay" && params.characterId === "reimu") {
    const saisenWord = "(?:賽銭箱|お賽銭|賽銭|寄付)";
    const userMentionsSaisen = new RegExp(saisenWord).test(lowerRecentUser);
    if (!userMentionsSaisen) {
      const before = out;
      out = out.replace(
        new RegExp(
          `[^。！？\\n]*${saisenWord}[^。！？\\n]*(?:寄越せ|よこせ|払え|出さないと|出さなきゃ|出さなければ|出さないなら|出せ(?!ば)|出しな)[^。！？\\n]*[。！？]?`,
          "g",
        ),
        "",
      );
      out = out.replace(/\n{3,}/g, "\n\n").trim();
      if (!out) out = before;
    }
  }

  // 4) Reimu: avoid “心情の分類（二択）”質問がカウンセラーっぽくなるのを抑える
  if (params.chatMode === "roleplay" && params.characterId === "reimu") {
    // If the exchange is about tiredness/low energy, don't force the user into “A or B”.
    // Replace with a single concrete question.
    const fatigue = /(疲れ|だる|しんど|モヤモヤ|憂鬱|眠|やる気)/i;
    if (fatigue.test(lowerRecentUser)) {
      out = out.replace(
        /(疲れ|だる|しんど|モヤモヤ|憂鬱|眠|やる気)[^。\n]{0,120}(?:どっち寄り|どっちに近い)[？?]/g,
        "で、いま一番面倒なのは何？",
      );
    }
  }

  // Collapse excessive blank lines produced by removals.
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out ? out : String(params.reply ?? "");
}

function sha256Hex(s: string) {
  return createHash("sha256").update(String(s ?? ""), "utf8").digest("hex");
}

function mergeMeta(
  base: unknown,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = isRecord(base) ? { ...(base as Record<string, unknown>) } : {};
  const cur = isRecord(out.touhou_ui) ? (out.touhou_ui as Record<string, unknown>) : {};
  out.touhou_ui = { ...cur, ...extra };
  return out;
}

async function loadCoreHistory(params: {
  supabase: Awaited<ReturnType<typeof supabaseServer>>;
  sessionId: string;
  userId: string;
  limit?: number;
}): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const limit = typeof params.limit === "number" ? params.limit : 16;
  try {
    const { data } = await params.supabase
      .from("common_messages")
      .select("role, content, created_at")
      .eq("session_id", params.sessionId)
      .eq("user_id", params.userId)
      .eq("app", "touhou")
      .order("created_at", { ascending: false })
      .limit(limit);

    const rows = Array.isArray(data) ? (data as any[]) : [];
    const mapped = rows
      .map((r) => {
        const roleRaw = typeof r?.role === "string" ? String(r.role) : "";
        const content = typeof r?.content === "string" ? String(r.content) : "";
        const role =
          roleRaw === "user" ? "user" : roleRaw === "ai" ? "assistant" : null;
        if (!role || !content.trim()) return null;
        return { role, content };
      })
      .filter(Boolean) as Array<{ role: "user" | "assistant"; content: string }>;

    return mapped.reverse();
  } catch {
    return [];
  }
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
  // conservative defaults (can be overridden by env)
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

  const triggers = ["調べて", "検索", "探して", "ニュース", "速報", "ヘッドライン", "最新", "ソース", "出典", "根拠", "参照", "リンク"];
  if (!containsAny(t, triggers)) return { enabled: false, query: "", recency_days: 7, domains: null };

  const isNews = containsAny(t, ["ニュース", "速報", "ヘッドライン", "記事"]);
  const isRecent = containsAny(t, ["今日", "本日", "最新", "いま", "今"]);
  const recency_days = isNews || isRecent ? 1 : 30;

  const theme = extractTheme(t);
  const wantsAI = containsAny(t, ["AI", "生成AI", "LLM", "ChatGPT", "エージェント"]) || (theme ? containsAny(theme, ["AI", "生成AI", "LLM", "ChatGPT"]) : false);
  const wantsJapan = containsAny(t, ["日本", "国内", "jp", "JAPAN"]) || (theme ? containsAny(theme, ["日本", "国内"]) : false);

  const tokens: string[] = [];
  if (isRecent) tokens.push("今日");
  if (wantsJapan) tokens.push("日本");
  if (wantsAI) tokens.push("AI");
  if (theme && theme.length > 0) tokens.push(theme);
  if (isNews) tokens.push("ニュース");

  // Use the user text as query; Serper supports natural queries.
  const baseQ = tokens.length > 0 ? tokens.join(" ") : t;
  const q = clampText(baseQ.replace(/\s+/g, " ").trim(), 240);
  const domains = isNews ? defaultNewsDomains() : null;
  return { enabled: true, query: q, recency_days, domains };
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
      safe_search: "active",
      domains: intent.domains,
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

  return clampText(msg, 12000);
}

function retrievalSystemHint(params: { linkAnalyses: Phase04LinkAnalysis[] }) {
  void params;
  return "";
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

function envFlag(name: string, defaultValue: boolean) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultValue;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return defaultValue;
}

function enforceOrigin(req: NextRequest) {
  const allowedRaw = String(process.env.TOUHOU_ALLOWED_ORIGINS ?? "").trim();
  const reqOrigin = req.headers.get("origin");
  const sameOrigin = new URL(req.url).origin;

  // If Origin header is missing, treat as same-origin (some clients / SSR fetches).
  if (!reqOrigin) return;

  const allowed = allowedRaw
    ? allowedRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [sameOrigin];

  if (!allowed.includes(reqOrigin)) {
    throw new Error(`Origin not allowed: ${reqOrigin}`);
  }
}

// Character persona is injected via `persona_system` (system-side) to avoid dilution over long chats.

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    enforceOrigin(req);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  const supabase = await supabaseServer();

  // Basic per-user rate limit (best-effort).
  const minIntervalMsRaw = Number(process.env.TOUHOU_RATE_LIMIT_MS ?? "1200");
  const minIntervalMs = Number.isFinite(minIntervalMsRaw)
    ? Math.max(0, Math.min(60_000, minIntervalMsRaw))
    : 1200;
  if (minIntervalMs > 0) {
    try {
      const { data } = await supabase
        .from("common_messages")
        .select("created_at")
        .eq("user_id", userId)
        .eq("app", "touhou")
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

  let accessToken: string | null = null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
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

  const coreHistory = await loadCoreHistory({ supabase, sessionId, userId, limit: 16 });
  const base = coreBaseUrl();

  const chatModeRaw =
    conv && typeof (conv as Record<string, unknown>).chat_mode === "string"
      ? String((conv as Record<string, unknown>).chat_mode)
      : null;
  const chatMode: TouhouChatMode =
    chatModeRaw === "roleplay" || chatModeRaw === "coach" ? chatModeRaw : "partner";

  const intentPromise: Promise<PersonaIntentResponse | null> = shouldUseDirectorOverlay({
    characterId,
    chatMode,
  })
    ? fetchPersonaIntent({
        base,
        accessToken,
        sessionId,
        characterId,
        chatMode,
        message: text.trim(),
        history: coreHistory,
      })
    : Promise.resolve(null);
  const isProd = process.env.NODE_ENV === "production";
  const uploadsEnabled = envFlag("TOUHOU_UPLOAD_ENABLED", !isProd);
  const linkAnalysisEnabled = envFlag("TOUHOU_LINK_ANALYSIS_ENABLED", !isProd);
  const autoBrowseEnabled = envFlag("TOUHOU_AUTO_BROWSE_ENABLED", false);

  const phase04Uploads = uploadsEnabled
    ? await uploadAndParseFiles({ base, accessToken, files })
    : [];

  let phase04Links: Phase04LinkAnalysis[] = [];
  if (linkAnalysisEnabled && urls.length > 0) {
    phase04Links = await analyzeLinks({ base, accessToken, urls });
  } else if (autoBrowseEnabled) {
    phase04Links = await autoBrowseFromText({ base, accessToken, userText: text.trim() });
  } else {
    phase04Links = [];
  }
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

  const isSeedTurn = isFirstAssistantTurn(coreHistory);
  const intent = await intentPromise;
  const personaSystemBase = buildTouhouPersonaSystem(characterId, {
    chatMode,
    includeExamples: isSeedTurn,
    includeRoleplayExamples: isSeedTurn,
  });

  // Turn-scoped tuning: prefer "tell the model" over "delete later".
  const lowerRecentUser = buildRecentUserText({ history: coreHistory, currentUserText: text });
  const saisenRe = /(?:賽銭箱|お賽銭|賽銭|寄付)/i;
  const userMentionsSaisen = saisenRe.test(lowerRecentUser);
  const assistantRecentText = coreHistory
    .filter((m) => m.role === "assistant")
    .slice(-3)
    .map((m) => String(m.content ?? ""))
    .join("\n");
  const assistantRecentlyMentionedSaisen = saisenRe.test(assistantRecentText);

  const turnTuningLines: string[] = [];
  if (chatMode === "roleplay" && characterId === "reimu" && !userMentionsSaisen) {
    if (assistantRecentlyMentionedSaisen) {
      turnTuningLines.push("- このターンは賽銭/寄付ネタを出さない（クールダウン）。");
    } else {
      turnTuningLines.push("- 賽銭/寄付ネタは最大1文まで（連発しない）。");
    }
  }

  const directorOverlay = intent ? reimuDirectorOverlay(intent) : "";
  const personaSystem = [personaSystemBase, turnTuningLines.length > 0 ? `# Turn constraints\n${turnTuningLines.join("\n")}` : null, directorOverlay || null]
    .filter(Boolean)
    .join("\n\n");
  const retrievalHint = retrievalSystemHint({ linkAnalyses: phase04Links });
  const personaSystemWithRetrieval = retrievalHint ? `${personaSystem}\n\n# Retrieval\n${retrievalHint}` : personaSystem;
  const personaSystemSha256 = sha256Hex(personaSystemWithRetrieval);
  const gen = genParamsFor(characterId);
  const streamMode = wantsStream(req);

  // Clarify short-circuit: when the intent director asks for a single confirm-question,
  // return it directly (saves latency/cost and prevents style drift).
  if (intent?.needs_clarify && (intent.clarify_question || "").trim()) {
    const replyFinal = String(intent.clarify_question || "").trim();

    const mergedMeta = mergeMeta(null, {
      persona_system_sha256: personaSystemSha256,
      chat_mode: chatMode,
      character_id: characterId,
      seed_turn: isSeedTurn,
      director_overlay: true,
      intent: intent.intent,
      intent_confidence: intent.confidence,
      intent_output_style: intent.output_style,
      intent_effective_output_style: effectiveOutputStyle(intent),
      intent_allowed_humor: intent.allowed_humor,
      intent_urgency: intent.urgency,
      intent_needs_clarify: intent.needs_clarify,
      intent_safety_risk: intent.safety_risk,
      forced_output_style_passed: true,
      forced_output_style_retry: false,
      forced_output_style_reason: "clarify_short_circuit",
    });

    const { error: aiInsertError } = await supabase.from("common_messages").insert({
      session_id: sessionId,
      user_id: userId,
      app: "touhou",
      role: "ai",
      content: replyFinal,
      speaker_id: characterId,
      meta: mergedMeta,
    });

    if (aiInsertError) {
      console.error("[touhou] ai message insert error:", aiInsertError);
      return NextResponse.json({ error: "Failed to save ai message" }, { status: 500 });
    }

    if (isRecord(mergedMeta)) {
      try {
        await supabase.from("common_state_snapshots").insert([
          toStateSnapshotRow({
            userId,
            sessionId,
            meta: mergedMeta as Record<string, unknown>,
          }),
        ]);
      } catch (e) {
        console.warn("[touhou] state snapshot insert failed:", e);
      }
    }

    if (!streamMode) {
      return NextResponse.json({ role: "ai", content: replyFinal, meta: mergedMeta });
    }

    const ts = new TransformStream();
    const writer = ts.writable.getWriter();
    try {
      await writer.write(toSse("start", { sessionId }));
      await writer.write(toSse("delta", { text: replyFinal }));
      await writer.write(toSse("done", { reply: replyFinal, meta: mergedMeta }));
    } catch {
      // ignore
    } finally {
      try {
        await writer.close();
      } catch {
        // ignore
      }
    }

    return new NextResponse(ts.readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

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
        history: coreHistory,
        character_id: characterId,
        chat_mode: chatMode,
        persona_system: personaSystemWithRetrieval,
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

    const replyGuarded = sanitizeReplyByContext({
      characterId,
      chatMode,
      reply: replySafe,
      history: coreHistory,
      currentUserText: text,
    });

    let replyFinal = replyGuarded;
    let forcedStylePassed = true;
    let forcedStyleRetry = false;
    let forcedStyleReason = "";

    if (intent) {
      const style = effectiveOutputStyle(intent);
      const lint1 = lintOutputStyle({ style, intent, reply: replyFinal });
      if (!lint1.ok) {
        forcedStylePassed = false;
        forcedStyleReason = lint1.reason;

        // No extra LLM call: do a minimal local coercion to the forced style.
        const coerced = coerceToForcedStyle({ style, intent, reply: replyFinal });
        if (coerced.applied) {
          const lint2 = lintOutputStyle({ style, intent, reply: coerced.reply });
          forcedStyleRetry = true;
          if (lint2.ok) {
            forcedStylePassed = true;
            forcedStyleReason = "";
            replyFinal = coerced.reply;
          } else {
            forcedStyleReason = `coerce_${lint2.reason}`;
          }
        }
      }
    }

    const mergedMeta = mergeMeta(data.meta ?? null, {
      persona_system_sha256: personaSystemSha256,
      chat_mode: chatMode,
      character_id: characterId,
      seed_turn: isSeedTurn,
      ...(intent
        ? {
            director_overlay: true,
            intent: intent.intent,
            intent_confidence: intent.confidence,
            intent_output_style: intent.output_style,
            intent_effective_output_style: effectiveOutputStyle(intent),
            intent_allowed_humor: intent.allowed_humor,
            intent_urgency: intent.urgency,
            intent_needs_clarify: intent.needs_clarify,
            intent_safety_risk: intent.safety_risk,
            forced_output_style_passed: forcedStylePassed,
            forced_output_style_retry: forcedStyleRetry,
            forced_output_style_reason: forcedStyleReason,
          }
        : { director_overlay: false }),
    });

    const { error: aiInsertError } = await supabase
      .from("common_messages")
      .insert({
        session_id: sessionId,
        user_id: userId,
        app: "touhou",
        role: "ai",
        content: replyFinal,
        speaker_id: characterId,
        meta: mergedMeta,
      });

    if (aiInsertError) {
      console.error("[touhou] ai message insert error:", aiInsertError);
      return NextResponse.json(
        { error: "Failed to save ai message" },
        { status: 500 }
      );
    }

    if (isRecord(mergedMeta)) {
      try {
        await supabase.from("common_state_snapshots").insert([
          toStateSnapshotRow({
            userId,
            sessionId,
            meta: mergedMeta as Record<string, unknown>,
          }),
        ]);
      } catch (e) {
        console.warn("[touhou] state snapshot insert failed:", e);
      }
    }

    return NextResponse.json({
      role: "ai",
      content: replyFinal,
      meta: mergedMeta,
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
      history: coreHistory,
      character_id: characterId,
      chat_mode: chatMode,
      persona_system: personaSystemWithRetrieval,
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

  const touhouUiMeta = {
    chat_mode: chatMode,
    character_id: characterId,
    persona_system_sha256: personaSystemSha256,
    seed_turn: isSeedTurn,
    ...(intent
      ? {
          director_overlay: true,
          intent: intent.intent,
          intent_confidence: intent.confidence,
          intent_output_style: intent.output_style,
          intent_effective_output_style: effectiveOutputStyle(intent),
          intent_allowed_humor: intent.allowed_humor,
          intent_urgency: intent.urgency,
          intent_needs_clarify: intent.needs_clarify,
          intent_safety_risk: intent.safety_risk,
        }
      : { director_overlay: false }),
  };

  let replyAcc = "";
  let finalMeta: Record<string, unknown> = mergeMeta(null, touhouUiMeta);

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
                  isRecord(parsed) && isRecord(parsed.meta)
                    ? mergeMeta(parsed.meta, touhouUiMeta)
                    : mergeMeta(null, touhouUiMeta);
                const replyGuarded = sanitizeReplyByContext({
                  characterId,
                  chatMode,
                  reply,
                  history: coreHistory,
                  currentUserText: text,
                });

                let replyFinal = replyGuarded;
                let forcedStylePassed = true;
                let forcedStyleRetry = false;
                let forcedStyleReason = "";

                if (intent) {
                  const style = effectiveOutputStyle(intent);
                  const lint1 = lintOutputStyle({ style, intent, reply: replyFinal });
                  if (!lint1.ok) {
                    forcedStylePassed = false;
                    forcedStyleReason = lint1.reason;

                    const coerced = coerceToForcedStyle({ style, intent, reply: replyFinal });
                    if (coerced.applied) {
                      const lint2 = lintOutputStyle({ style, intent, reply: coerced.reply });
                      forcedStyleRetry = true;
                      if (lint2.ok) {
                        forcedStylePassed = true;
                        forcedStyleReason = "";
                        replyFinal = coerced.reply;
                      } else {
                        forcedStyleReason = `coerce_${lint2.reason}`;
                      }
                    }
                  }

                  finalMeta = mergeMeta(finalMeta, {
                    forced_output_style_passed: forcedStylePassed,
                    forced_output_style_retry: forcedStyleRetry,
                    forced_output_style_reason: forcedStyleReason,
                  });
                }

                replyAcc = replyFinal;
                await writer.write(toSse("done", { reply: replyFinal, meta: finalMeta }));
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
            : "すみません、うまく返事を作れませんでした。もう一度送ってください。";

        const replyGuarded = sanitizeReplyByContext({
          characterId,
          chatMode,
          reply: replySafe,
          history: coreHistory,
          currentUserText: text,
        });

        await supabase.from("common_messages").insert({
          session_id: sessionId,
          user_id: userId,
          app: "touhou",
          role: "ai",
          content: replyGuarded,
          speaker_id: characterId,
          meta: finalMeta,
        });
      } catch (e) {
        console.warn("[touhou] persist ai message failed:", e);
      }

      try {
        await supabase.from("common_state_snapshots").insert([
          toStateSnapshotRow({ userId, sessionId, meta: finalMeta }),
        ]);
      } catch (e) {
        console.warn("[touhou] state snapshot insert failed:", e);
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
