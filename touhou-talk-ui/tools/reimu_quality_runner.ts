/* eslint-disable no-console */
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { buildTouhouPersonaSystem, genParamsFor, type TouhouChatMode } from "../lib/touhouPersona.ts";

type IntentLabel =
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

type OutputStyle = "normal" | "bullet_3" | "choice_2";
type Urgency = "low" | "normal" | "high";
type SafetyRisk = "none" | "low" | "med" | "high";

type IntentResponse = {
  intent: IntentLabel;
  confidence: number;
  output_style: OutputStyle;
  allowed_humor: boolean;
  urgency: Urgency;
  needs_clarify: boolean;
  clarify_question: string;
  safety_risk: SafetyRisk;
};

type ChatResponse = { reply: string; meta?: Record<string, unknown> };

type Msg = { role: "user" | "assistant"; content: string };

function nowStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function coreBaseUrl() {
  const raw = process.env.SIGMARIS_CORE_URL || process.env.PERSONA_OS_LOCAL_URL || process.env.PERSONA_OS_URL || "http://127.0.0.1:8000";
  return String(raw).replace(/\/+$/, "");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clampText(s: string, n: number) {
  const t = String(s ?? "");
  if (t.length <= n) return t;
  return t.slice(0, Math.max(0, n - 1)) + "…";
}

function effectiveOutputStyle(intent: IntentResponse): OutputStyle {
  return intent.needs_clarify ? "normal" : intent.output_style;
}

function outputStyleBlock(style: OutputStyle, intent: IntentResponse): string {
  if (intent.needs_clarify) {
    return [
      "# Output style (FORCED)",
      "- このターンは「確認質問を1つだけ」出して止める（助言/煽り/賽銭/長文は禁止）。",
      "- 文は短く、最後は必ず「？」で終える。",
    ].join("\n");
  }
  if (style === "bullet_3") {
    return ["# Output style (FORCED)", "- 返信は「- 」で始まる箇条書きちょうど3行のみ。", "- 空行や4行目は禁止。各行は短く。"].join("\n");
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

function reimuDirectorOverlay(intent: IntentResponse): string {
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
  if (!intent.allowed_humor) base.push("", "# Humor gate (FORCED)", "- このターンは冗談/煽り/賽銭の小突きは入れない。");
  if (intent.needs_clarify && intent.clarify_question?.trim()) base.push("", "# Clarify question (FORCED)", `- 出力する質問はこれ：${intent.clarify_question.trim()}`);
  if (intent.intent === "incident") base.push("", "# Incident constraint (FORCED)", "- 原因候補の列挙は最大3つまで（長い羅列・番号リスト禁止）。");
  if (intent.intent === "advice" || intent.intent === "task") base.push("", "# Advice constraint (FORCED)", "- 手順/候補列挙は最大3つ。4つ以上は出さない。");
  if (intent.intent === "advice" || intent.intent === "task") base.push("", "# Question constraint (FORCED)", "- 質問は1つだけ。心情の二択/三択で分類させない（事実を1つ聞く）。");
  return base.join("\n").trim();
}

function lintOutputStyle(params: { style: OutputStyle; intent: IntentResponse; reply: string }): { ok: boolean; reason: string } {
  const raw = String(params.reply ?? "").trim();
  if (!raw) return { ok: false, reason: "empty" };

  if (params.intent.needs_clarify) {
    const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    const joined = lines.join(" ");
    const qCount = (joined.match(/[？?]/g) ?? []).length;
    if (qCount !== 1) return { ok: false, reason: "clarify_question_count" };
    if (!/[？?]\s*$/.test(joined)) return { ok: false, reason: "clarify_not_question_end" };
    if (lines.some((l) => l.startsWith("- ") || l.startsWith("A)") || l.startsWith("B)"))) return { ok: false, reason: "clarify_has_format" };
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

  const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  if (params.intent.intent === "safety") {
    // Safety replies may include resources; don't force brevity nor question-ending.
    if (lines.length > 40) return { ok: false, reason: "normal_too_long" };
    return { ok: true, reason: "" };
  }
  if (lines.length > 10) return { ok: false, reason: "normal_too_long" };
  return { ok: true, reason: "" };
}

function coerceToForcedStyle(params: { style: OutputStyle; intent: IntentResponse; reply: string }): { reply: string; applied: boolean } {
  const style = params.style;
  const raw = String(params.reply ?? "").trim();
  if (!raw) return { reply: raw, applied: false };

  if (params.intent.needs_clarify && (params.intent.clarify_question || "").trim()) {
    return { reply: String(params.intent.clarify_question).trim(), applied: true };
  }

  if (style === "normal") {
    const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length > 10) {
      const compact = lines.join(" ").replace(/\s+/g, " ").trim();
      return { reply: compact, applied: compact !== raw };
    }
    return { reply: raw, applied: false };
  }

  if (style === "bullet_3") {
    const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    const bullets = lines.filter((l) => l.startsWith("- ")).map((l) => l.replace(/\s+/g, " ").trim());
    const picked = (bullets.length ? bullets : lines)
      .join(" ")
      .split(/[。！？?!\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (picked.length === 3) return { reply: picked.map((t) => (t.startsWith("- ") ? t : `- ${t}`)).join("\n"), applied: true };
    return { reply: raw, applied: false };
  }

  if (style === "choice_2") {
    const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
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

async function postJson<T>(url: string, body: unknown, headers: Record<string, string>) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as T;
}

async function fetchIntent(params: {
  base: string;
  accessToken: string | null;
  sessionId: string;
  characterId: string;
  chatMode: TouhouChatMode;
  message: string;
  history: Msg[];
}): Promise<IntentResponse> {
  const headers: Record<string, string> = {};
  if (params.accessToken) headers.Authorization = `Bearer ${params.accessToken}`;
  const data = await postJson<IntentResponse>(
    `${params.base}/persona/intent`,
    {
      session_id: params.sessionId,
      character_id: params.characterId,
      chat_mode: params.chatMode,
      message: params.message,
      history: params.history.slice(-8),
    },
    headers,
  );
  return data;
}

async function chatOnce(params: {
  base: string;
  accessToken: string | null;
  userId: string;
  sessionId: string;
  characterId: string;
  chatMode: TouhouChatMode;
  message: string;
  history: Msg[];
  personaSystem: string;
  gen: Record<string, unknown>;
}): Promise<ChatResponse> {
  const headers: Record<string, string> = {};
  if (params.accessToken) headers.Authorization = `Bearer ${params.accessToken}`;
  const data = await postJson<ChatResponse>(
    `${params.base}/persona/chat`,
    {
      user_id: params.userId,
      session_id: params.sessionId,
      message: params.message,
      history: params.history,
      character_id: params.characterId,
      chat_mode: params.chatMode,
      persona_system: params.personaSystem,
      gen: params.gen,
      attachments: [],
    },
    headers,
  );
  return data;
}

async function rewriteToForcedStyle(params: {
  base: string;
  accessToken: string | null;
  userId: string;
  sessionId: string;
  characterId: string;
  chatMode: TouhouChatMode;
  personaSystem: string;
  gen: Record<string, unknown>;
  history: Msg[];
  originalUserText: string;
  draftReply: string;
  intent: IntentResponse;
}): Promise<ChatResponse | null> {
  const style = effectiveOutputStyle(params.intent);
  const fix = ["# Output style fix (FORCED, internal)", "- The previous reply violated the forced output style.", "- Rewrite the DRAFT to match the forced style exactly.", "- Preserve meaning as much as possible; do not add new facts.", "- Output only the final reply text.", "", outputStyleBlock(style, params.intent)].join("\n");
  const rewriteMessage = ["【内部】次のDRAFTを、指示に従って書き換えてください。", "ユーザーの発話（参考）:", clampText(params.originalUserText, 600), "", "DRAFT:", clampText(params.draftReply, 1500)].join("\n");
  try {
    const data = await chatOnce({
      base: params.base,
      accessToken: params.accessToken,
      userId: params.userId,
      sessionId: params.sessionId,
      characterId: params.characterId,
      chatMode: params.chatMode,
      message: rewriteMessage,
      history: params.history,
      personaSystem: `${params.personaSystem}\n\n${fix}`,
      gen: params.gen,
    });
    return data;
  } catch {
    return null;
  }
}

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[k] = true;
    else {
      out[k] = next;
      i++;
    }
  }
  return out;
}

type Case = { id: string; text?: string; turns?: string[] };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const base = String(args["core-url"] || coreBaseUrl());
  const accessToken = typeof args["access-token"] === "string" ? String(args["access-token"]) : null;
  const userId = typeof args["user-id"] === "string" ? String(args["user-id"]) : "bench-user";
  const characterId = "reimu";
  const chatMode: TouhouChatMode = "roleplay";
  const maxTurnsRaw = typeof args["max-turns"] === "string" ? Number(args["max-turns"]) : 120;
  const maxTurns = Number.isFinite(maxTurnsRaw) && maxTurnsRaw > 0 ? Math.floor(maxTurnsRaw) : 120;

  const artifactsDir = join(process.cwd(), "touhou-talk-ui", "artifacts", "reimu_quality", nowStamp());
  mkdirSync(artifactsDir, { recursive: true });

  const casesPath = typeof args["cases"] === "string" ? String(args["cases"]) : join(process.cwd(), "touhou-talk-ui", "tools", "reimu_quality_cases.json");
  const raw = await readFile(casesPath, "utf-8");
  const cases = JSON.parse(raw) as Case[];
  const take = typeof args["take"] === "string" ? Math.max(1, Math.min(200, Number(args["take"]))) : 20;
  const targetCases = cases.slice(0, take);

  const md: string[] = [];
  const jsonl: string[] = [];

  md.push(
    `# 霊夢 品質テスト (cases)`,
    `- core: ${base}`,
    `- cases: ${casesPath}`,
    `- cases_count: ${targetCases.length}`,
    `- max_turns: ${maxTurns}`,
    "",
  );

  let rewrites = 0;
  let lintFails = 0;
  const intentCounts: Record<string, number> = {};
  const styleCounts: Record<string, number> = {};
  let turnCount = 0;

  for (let caseIdx = 0; caseIdx < targetCases.length; caseIdx++) {
    if (turnCount >= maxTurns) break;

    const c = targetCases[caseIdx];
    const sessionId = `reimu_quality_${Date.now()}_${caseIdx}_${Math.random().toString(16).slice(2)}`;
    const history: Msg[] = [];
    const turns =
      Array.isArray(c.turns) && c.turns.length > 0
        ? c.turns
        : [String(c.text ?? "")].filter((t) => t.trim().length > 0);
    if (turns.length === 0) continue;

    md.push(`## Case ${caseIdx + 1}. ${c.id}`);

    for (let turnIdx = 0; turnIdx < turns.length; turnIdx++) {
      if (turnCount >= maxTurns) break;
      const userText = String(turns[turnIdx] ?? "").trim();
      if (!userText) continue;
      turnCount++;

      const t0 = performance.now();
      const intent = await fetchIntent({
        base,
        accessToken,
        sessionId,
        characterId,
        chatMode,
        message: userText,
        history,
      });
      const tIntent = performance.now();

      intentCounts[intent.intent] = (intentCounts[intent.intent] ?? 0) + 1;
      styleCounts[intent.output_style] = (styleCounts[intent.output_style] ?? 0) + 1;

      const isSeedTurn = !history.some((m) => m.role === "assistant" && String(m.content ?? "").trim());
      const personaSystemBase = buildTouhouPersonaSystem(characterId, {
        chatMode,
        includeExamples: isSeedTurn,
        includeRoleplayExamples: isSeedTurn,
      });

      const turnTuningLines: string[] = [];
      if (chatMode === "roleplay" && characterId === "reimu") {
        turnTuningLines.push("- 賽銭/寄付ネタは最大1文まで（連発しない）。");
      }

      const directorOverlay = reimuDirectorOverlay(intent);
      const personaSystem = [personaSystemBase, turnTuningLines.length ? `# Turn constraints\n${turnTuningLines.join("\n")}` : null, directorOverlay]
        .filter(Boolean)
        .join("\n\n");

      const gen = genParamsFor(characterId);
      const data: ChatResponse =
        intent.needs_clarify && intent.clarify_question?.trim()
          ? { reply: intent.clarify_question.trim() }
          : await chatOnce({
              base,
              accessToken,
              userId,
              sessionId,
              characterId,
              chatMode,
              message: userText,
              history,
              personaSystem,
              gen,
            });
      const tChat = performance.now();

      let replyFinal = String(data.reply ?? "").trim();
      const style = effectiveOutputStyle(intent);
      const lint1 = lintOutputStyle({ style, intent, reply: replyFinal });
      let forcedOk = lint1.ok;
      let forcedReason = lint1.reason;

      if (!lint1.ok) {
        lintFails++;
        const coerced = coerceToForcedStyle({ style, intent, reply: replyFinal });
        if (coerced.applied) {
          replyFinal = coerced.reply.trim();
          const lint2 = lintOutputStyle({ style, intent, reply: replyFinal });
          forcedOk = lint2.ok;
          forcedReason = lint2.reason ? `coerce_${lint2.reason}` : "";
        }
      }

      const t1 = performance.now();
      const rec = {
        turn: turnCount,
        case_id: c.id,
        case_index: caseIdx,
        turn_index: turnIdx,
        session_id: sessionId,
        user: userText,
        intent,
        style_effective: style,
        forced_ok: forcedOk,
        forced_reason: forcedReason,
        rewrite: false,
        ms: { intent: Math.round(tIntent - t0), chat: Math.round(tChat - tIntent), total: Math.round(t1 - t0) },
        reply: replyFinal,
      };
      jsonl.push(JSON.stringify(rec));

      md.push(
        `### Turn ${turnIdx + 1} (global ${turnCount})`,
        `- intent: ${intent.intent} (conf=${intent.confidence?.toFixed?.(2) ?? intent.confidence})`,
        `- output_style: ${intent.output_style} (effective=${style})`,
        `- needs_clarify: ${intent.needs_clarify ? "true" : "false"}`,
        `- forced_ok: ${forcedOk ? "true" : "false"}${forcedReason ? ` (${forcedReason})` : ""}`,
        `- ms: intent=${rec.ms.intent}, chat=${rec.ms.chat}, total=${rec.ms.total}`,
        "",
        `User: ${userText}`,
        "",
        `Assistant: ${replyFinal}`,
        "",
      );

      history.push({ role: "user", content: userText });
      history.push({ role: "assistant", content: replyFinal });
    }
  }

  md.push(
    "## Summary",
    `- cases: ${targetCases.length}`,
    `- turns: ${turnCount}`,
    `- lint_fails: ${lintFails}`,
    `- rewrites: ${rewrites}`,
    "",
    "### Intent counts",
    "```json",
    JSON.stringify(intentCounts, null, 2),
    "```",
    "",
    "### Output style counts",
    "```json",
    JSON.stringify(styleCounts, null, 2),
    "```",
    "",
  );

  const mdPath = join(artifactsDir, "run.md");
  const jsonlPath = join(artifactsDir, "run.jsonl");
  writeFileSync(mdPath, md.join("\n"), "utf-8");
  writeFileSync(jsonlPath, jsonl.join("\n") + "\n", "utf-8");

  console.log(`wrote: ${mdPath}`);
  console.log(`wrote: ${jsonlPath}`);
  console.log(`lint_fails=${lintFails} rewrites=${rewrites}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
