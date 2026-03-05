/* eslint-disable no-console */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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

function resolveTouhouUiRoot() {
  const cwd = process.cwd();
  // Running inside touhou-talk-ui
  if (existsSync(join(cwd, "tools", "reimu_quality_runner.ts")) && existsSync(join(cwd, "lib", "touhouPersona.ts"))) {
    return cwd;
  }
  // Running from monorepo root
  const nested = join(cwd, "touhou-talk-ui");
  if (existsSync(join(nested, "tools", "reimu_quality_runner.ts"))) return nested;
  return cwd;
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

function looksLikeQuestion(text: string) {
  const s = String(text ?? "").trim();
  return /[？?]\s*$/.test(s);
}

function lastAssistantContent(history: Msg[]) {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m?.role === "assistant") return String(m.content ?? "").trim();
  }
  return "";
}

// Vague-but-valid answers that should not trigger "clarify" spirals.
// NOTE: allow casual suffixes like 「んだよね」「かな」 etc.
const VAGUE_BUT_VALID_RE =
  /^(?:(?:特に|べつに|別に)?(?:決めてない|決まってない|決めてねえ|決まってねえ)|(?:特に|べつに|別に)?(?:ない|何もない|なんもない)|(?:なんでも|どっちでも|どちらでも)(?:いい|いいよ|OK|おけ|可|かまわない)|(?:わからない|分からない|知らない|覚えてない|覚えていない)|(?:未定|まだ|あとで|そのうち))(?:\s*(?:んだ|んだけど|んだよ|んだよね|んだよねぇ|だよ|だよね|だね|だな|かな|かも|けど|けどさ|けどね|だけど|だけどさ|だけどね|よ|よね|ね|な|とか))?(?:[。．!！…〜]+)?$/;

function normalizePersonaIntent(params: {
  intent: IntentResponse;
  history: Msg[];
  userText: string;
  characterId: string;
  chatMode: TouhouChatMode;
}): IntentResponse {
  const out: IntentResponse = { ...params.intent };

  // Reimu roleplay: if the user gives a vague-but-valid answer to a question, keep the flow.
  if (params.chatMode === "roleplay" && params.characterId === "reimu") {
    const lastA = lastAssistantContent(params.history);
    const msg = String(params.userText ?? "").trim();
    if (looksLikeQuestion(lastA) && VAGUE_BUT_VALID_RE.test(msg)) {
      out.intent = "chitchat";
      out.confidence = Math.max(0.9, Number.isFinite(out.confidence) ? out.confidence : 0);
      out.output_style = "normal";
      out.allowed_humor = true;
      out.urgency = "low";
      out.needs_clarify = false;
      out.clarify_question = "";
      out.safety_risk = "none";
    }
  }

  return out;
}

function effectiveOutputStyle(intent: IntentResponse): OutputStyle {
  return intent.needs_clarify && intent.intent === "unclear" ? "normal" : intent.output_style;
}

function outputStyleBlock(style: OutputStyle, intent: IntentResponse): string {
  if (intent.needs_clarify && intent.intent === "unclear") {
    return [
      "# Output style (FORCED)",
      "- このターンは「確認質問を1つだけ」出して止める（助言/煽り/賽銭/長文は禁止）。",
      "- 文は短く、最後は必ず「？」で終える。",
    ].join("\n");
  }
  if (style === "bullet_3") {
    return [
      "# Output style (FORCED)",
      "- 返信は「- 」で始まる箇条書きちょうど3行のみ（3行で終わる）。",
      "- 空行や4行目は禁止。質問や締めの一言も追加しない。",
      "- 各行は短く。",
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

  if (intent.intent === "meta") {
    base.push(
      "",
      "# Meta handling (FORCED)",
      "- 用語定義（「〜とは」）や仕組み説明はしない。理由も1文以内。",
      "- 返答は2〜4文以内。",
      "- 1文目は短い拒否（霊夢口調）。",
      "- 最後はメタ以外の話題に戻す質問を1つだけ。",
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
    base.push("", "# Default handling", "- 受け→短い確認→必要なら最小3手→質問で止める。");
  }

  if (!intent.allowed_humor) {
    base.push("", "# Humor gate (FORCED)", "- このターンは冗談/煽り/賽銭の小突きは入れない。");
  }

  if (intent.needs_clarify && intent.intent === "unclear" && (intent.clarify_question || "").trim()) {
    base.push("", "# Clarify question (FORCED)", `- 出力する質問はこれ：${intent.clarify_question.trim()}`);
  }
  return base.join("\n").trim();
}

function lintOutputStyle(params: { style: OutputStyle; intent: IntentResponse; reply: string }): { ok: boolean; reason: string } {
  const raw = String(params.reply ?? "").trim();
  if (!raw) return { ok: false, reason: "empty" };

  if (params.intent.needs_clarify && params.intent.intent === "unclear") {
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

  if (params.intent.needs_clarify && params.intent.intent === "unclear" && (params.intent.clarify_question || "").trim()) {
    return { reply: String(params.intent.clarify_question).trim(), applied: true };
  }

  if (style === "normal") {
    const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length <= 10) return { reply: raw, applied: false };

    let bulletCount = 0;
    let numberedCount = 0;
    const kept: string[] = [];
    for (const line of lines) {
      if (line.startsWith("- ")) {
        if (bulletCount < 3) kept.push(line);
        bulletCount++;
        continue;
      }
      if (/^\d+[.)]\s*/.test(line)) {
        if (numberedCount < 3) kept.push(line);
        numberedCount++;
        continue;
      }
      kept.push(line);
    }

    const merged: string[] = [];
    for (const line of kept) {
      const last = merged[merged.length - 1];
      const lineIsList = line.startsWith("- ") || /^\d+[.)]\s*/.test(line);
      const lastIsList = typeof last === "string" && (last.startsWith("- ") || /^\d+[.)]\s*/.test(last));
      if (!last || lineIsList || lastIsList) {
        merged.push(line);
        continue;
      }
      merged[merged.length - 1] = `${last} ${line}`.replace(/\s+/g, " ").trim();
    }

    const next = merged.slice(0, 10).join("\n").trim();
    return { reply: next, applied: next !== raw };
  }

  if (style === "bullet_3") {
    const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    const bullets = lines.filter((l) => l.startsWith("- ")).map((l) => l.replace(/\s+/g, " ").trim());
    if (bullets.length >= 3) {
      const next = bullets.slice(0, 3).join("\n").trim();
      return { reply: next, applied: next !== raw };
    }
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
  const characterId = typeof args["character"] === "string" ? String(args["character"]) : "reimu";
  const chatMode: TouhouChatMode = "roleplay";
  const maxTurnsRaw = typeof args["max-turns"] === "string" ? Number(args["max-turns"]) : 120;
  const maxTurns = Number.isFinite(maxTurnsRaw) && maxTurnsRaw > 0 ? Math.floor(maxTurnsRaw) : 120;

  const uiRoot = resolveTouhouUiRoot();
  const suite = typeof args["suite"] === "string" ? String(args["suite"]).trim() : "";
  const artifactsDir = suite
    ? join(uiRoot, "artifacts", `${characterId}_quality`, suite, nowStamp())
    : join(uiRoot, "artifacts", `${characterId}_quality`, nowStamp());
  mkdirSync(artifactsDir, { recursive: true });

  const casesPath =
    typeof args["cases"] === "string" ? String(args["cases"]) : join(uiRoot, "tools", "reimu_quality_cases.json");
  const raw = await readFile(casesPath, "utf-8");
  const cases = JSON.parse(raw) as Case[];
  const take = typeof args["take"] === "string" ? Math.max(1, Math.min(200, Number(args["take"]))) : 20;
  const targetCases = cases.slice(0, take);

  const md: string[] = [];
  const jsonl: string[] = [];

  md.push(
    `# ${characterId} 品質テスト (cases)`,
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

  const useDirector = chatMode === "roleplay" && characterId === "reimu";

  for (let caseIdx = 0; caseIdx < targetCases.length; caseIdx++) {
    if (turnCount >= maxTurns) break;

    const c = targetCases[caseIdx];
    const sessionId = `${characterId}_quality_${Date.now()}_${caseIdx}_${Math.random().toString(16).slice(2)}`;
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
      let intent = useDirector
        ? await fetchIntent({
            base,
            accessToken,
            sessionId,
            characterId,
            chatMode,
            message: userText,
            history,
          })
        : ({
            intent: "chitchat",
            confidence: 0.0,
            output_style: "normal",
            allowed_humor: true,
            urgency: "normal",
            needs_clarify: false,
            clarify_question: "",
            safety_risk: "none",
          } as IntentResponse);
      intent = normalizePersonaIntent({
        intent,
        history,
        userText,
        characterId,
        chatMode,
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

      const directorOverlay = useDirector ? reimuDirectorOverlay(intent) : "";
      const personaSystem = [
        personaSystemBase,
        turnTuningLines.length ? `# Turn constraints\n${turnTuningLines.join("\n")}` : null,
        directorOverlay || null,
      ]
        .filter(Boolean)
        .join("\n\n");

      const gen = genParamsFor(characterId);
      const data: ChatResponse =
        useDirector && intent.needs_clarify && intent.intent === "unclear" && intent.clarify_question?.trim()
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
      let coerceApplied = false;

      if (!lint1.ok) {
        lintFails++;
        const coerced = coerceToForcedStyle({ style, intent, reply: replyFinal });
        if (coerced.applied) {
          coerceApplied = true;
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
        lint1_ok: lint1.ok,
        lint1_reason: lint1.reason,
        coerce_applied: coerceApplied,
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
        `- forced_ok: ${forcedOk ? "true" : "false"}${forcedReason ? ` (${forcedReason})` : ""}${coerceApplied ? " [coerced]" : ""}`,
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
