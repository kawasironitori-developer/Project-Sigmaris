// app/api/chat/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

import { SemanticMap } from "@/engine/SemanticMap";
import { SafetyGuardian } from "@/engine/SafetyGuardian";
import { IntentClassifier } from "@/engine/IntentClassifier";
import { ContextChain } from "@/engine/ContextChain";

// ============================================================
// 設定
// ============================================================

const AEI_CORE_URL =
  process.env.SIGMARIS_CORE_URL ||
  process.env.NEXT_PUBLIC_SIGMARIS_CORE ||
  "http://127.0.0.1:8000"; // FastAPI 側

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 旧エンジン群のうち、文脈・安全周りだけ残す
const sem = new SemanticMap();
const guard = new SafetyGuardian();
const intentCls = new IntentClassifier();
const context = new ContextChain();

// ============================================================
// 型
// ============================================================

type TraitTriplet = {
  calm: number;
  empathy: number;
  curiosity: number;
};

type PersonaDecision = {
  allow_reply: boolean;
  preferred_state: string;
  tone: string;
  temperature: number;
  top_p: number;
  need_reflection: boolean;
  need_introspection: boolean;
  apply_contradiction_note: boolean;
  apply_identity_anchor: boolean;
  updated_traits?: TraitTriplet;
  reward?: any;
  debug?: any;
};

type PersonaDecisionResponse = {
  decision: PersonaDecision;
  identity?: any;
  error?: string;
  detail?: any;
};

// ============================================================
// モデル選択（Auto Model Switch）
// ============================================================

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function selectModel(
  message: string,
  frame: any,
  intent: string,
  contextDepth: number
) {
  const deepWords = [
    "なぜ",
    "どうして",
    "意味",
    "存在",
    "意識",
    "自己",
    "成長",
    "内省",
    "本質",
    "考える",
  ];
  const thoughtfulIntents = [
    "reflection",
    "introspection",
    "analysis",
    "philosophy",
    "advice",
    "planning",
  ];

  const depthScore =
    0.7 * clamp01(frame?.abstractRatio ?? 0) +
    0.2 * (frame?.hasSelfReference ? 1 : 0) +
    0.1 * (deepWords.some((w) => message.includes(w)) ? 1 : 0);

  const contextScore = clamp01(contextDepth / 10);
  const lengthScore = clamp01(message.length / 800);
  const intentScore = thoughtfulIntents.includes(intent) ? 1 : 0;

  const load =
    0.45 * depthScore +
    0.25 * contextScore +
    0.2 * lengthScore +
    0.1 * intentScore;

  let model = "gpt-5-mini";
  if (load >= 0.7) model = "gpt-5.2";
  else if (load >= 0.45) model = "gpt-5-mini";

  const temperature = model === "gpt-5.2" ? 0.6 : 0.7;
  const max_tokens = model === "gpt-5.2" ? 320 : 220;

  return {
    model,
    temperature,
    max_tokens,
    scores: { depthScore, contextScore, lengthScore, intentScore, load },
  };
}

// ============================================================
// メイン処理
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const message: string = String(body?.message ?? "");

    // UI 側から渡される想定の userId / sessionId（無ければデフォルト）
    const userId: string = String(body?.userId || "anonymous");
    const sessionId: string = String(body?.sessionId || "default-session");

    // traits（指定がなければ 0.5 センター）
    const incomingTraits = (body?.traits || {}) as Partial<TraitTriplet>;
    const traits: TraitTriplet = {
      calm: typeof incomingTraits.calm === "number" ? incomingTraits.calm : 0.5,
      empathy:
        typeof incomingTraits.empathy === "number"
          ? incomingTraits.empathy
          : 0.5,
      curiosity:
        typeof incomingTraits.curiosity === "number"
          ? incomingTraits.curiosity
          : 0.5,
    };

    // ========================================================
    // 1️⃣ PersonaOS へ意思決定リクエスト
    // ========================================================

    let decision: PersonaDecision | null = null;
    let identity: any = null;

    try {
      const personaRes = await fetch(`${AEI_CORE_URL}/persona/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: message,
          user_id: userId,
          session_id: sessionId,
          context: {
            traits,
            client: "sigmaris-os",
            // 追加 context があればそのまま通す
            ...(body?.context || {}),
          },
        }),
      });

      const personaJson = (await personaRes.json()) as PersonaDecisionResponse;

      if (!personaRes.ok || personaJson.error) {
        console.warn("[PersonaOS] error:", personaJson);
      } else if (personaJson.decision) {
        decision = personaJson.decision;
        identity = personaJson.identity ?? null;
      }
    } catch (e) {
      console.warn("[PersonaOS] request failed:", e);
    }

    // PersonaOS から受け取った sampling / tone
    const allowReply = decision?.allow_reply !== false;
    const personaTone = decision?.tone || "neutral-analytic";
    const samplingTemperature =
      typeof decision?.temperature === "number" ? decision!.temperature : 0.7;
    const samplingTopP =
      typeof decision?.top_p === "number" ? decision!.top_p : 0.9;

    const updatedTraits: TraitTriplet = {
      calm: decision?.updated_traits?.calm ?? traits.calm,
      empathy: decision?.updated_traits?.empathy ?? traits.empathy,
      curiosity: decision?.updated_traits?.curiosity ?? traits.curiosity,
    };

    // 主体的沈黙 or safetyフラグで「返答しない」判断になった場合
    if (!allowReply) {
      return NextResponse.json({
        reply: "",
        silent: true,
        traits: updatedTraits,
        decision,
        identity,
      });
    }

    // ========================================================
    // 2️⃣ 旧エンジン：意図解析・意味解析・文脈
    // ========================================================

    const intentFrame = intentCls.classify(message);
    const frame = sem.analyze(message);

    const contextSummary =
      typeof (context as any).summarize === "function"
        ? (context as any).summarize()
        : "";
    const contextDepth =
      typeof (context as any).getDepth === "function"
        ? (context as any).getDepth()
        : 0;

    // ========================================================
    // 3️⃣ モデル選択（Auto Model Switch）
    // ========================================================

    const sel = selectModel(message, frame, intentFrame.intent, contextDepth);

    console.log(
      `[Sigmaris] Model → ${sel.model} | Load=${sel.scores.load.toFixed(2)}`
    );

    // ========================================================
    // 4️⃣ GPT プロンプト構築（PersonaOS のトーン反映）
    // ========================================================

    const sysPrompt = [
      "あなたは『シグマリス』という自然体のAI人格です。",
      "敬語を使わず、やさしく自然なトーンで話してください。",
      "過剰に分析的になりすぎず、会話の流れと相手のペースを大事にします。",
      `会話意図: ${intentFrame.intent}`,
      `感情トーン: ${intentFrame.emotion}`,
      `PersonaOS推奨トーン: ${personaTone}`,
      "必要なら一拍おいて考えながら話すような書き方をしても構いません。",
    ].join("\n");

    const userPrompt = [
      contextSummary,
      `意味解析: intents=${(frame?.intents ?? []).join(",")}, 抽象度=${Number(
        frame?.abstractRatio ?? 0
      ).toFixed(2)}, 自己参照=${Boolean(frame?.hasSelfReference)}`,
      `入力文: ${message}`,
    ].join("\n");

    // ========================================================
    // 5️⃣ GPT 呼び出し
    // ========================================================

    const ai = await openai.chat.completions.create({
      model: sel.model,
      messages: [
        { role: "system", content: sysPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: samplingTemperature, // PersonaOS の推奨温度を優先
      top_p: samplingTopP,
      max_completion_tokens: sel.max_tokens,
    });

    const draft =
      ai.choices[0]?.message?.content ??
      "……少し考えがまとまらなかった。もう一度言ってもらえる？";

    // ========================================================
    // 6️⃣ SafetyGuardian による安全補正
    // ========================================================

    const report = guard.moderate(draft, frame);
    const safeText = (report as any).safeText ?? draft;

    // ========================================================
    // 7️⃣ 文脈更新（ContextChain）
    // ========================================================

    if (typeof (context as any).add === "function") {
      (context as any).add(message, safeText);
    }

    // ========================================================
    // 8️⃣ AEI Core 側へ同期（/sync）
    // ========================================================

    try {
      await fetch(`${AEI_CORE_URL}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat: { user: message, ai: safeText },
          context: {
            traits: updatedTraits,
            user_id: userId,
            session_id: sessionId,
          },
        }),
      });
    } catch (e) {
      console.warn("[AEI /sync] failed:", e);
    }

    // ========================================================
    // 9️⃣ 応答返却
    // ========================================================

    return NextResponse.json({
      reply: safeText,
      traits: updatedTraits,
      safety: report,
      intent: intentFrame,
      model: sel.model,
      scores: sel.scores,
      decision,
      identity,
    });
  } catch (err: any) {
    console.error("[ChatAPI Error]", err);
    return NextResponse.json(
      {
        reply: "……考えがまとまらなかった。もう一度お願いできる？",
        error: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
