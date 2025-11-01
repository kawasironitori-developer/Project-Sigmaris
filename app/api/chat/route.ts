// app/api/chat/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { SemanticMap } from "@/engine/SemanticMap";
import { SafetyGuardian } from "@/engine/SafetyGuardian";
import { GrowthEngine } from "@/engine/GrowthEngine";
import { LongTermMemory } from "@/engine/LongTermMemory";
import { ReflectionEngine } from "@/engine/ReflectionEngine";
import { IntentClassifier } from "@/engine/IntentClassifier";
import { ContextChain } from "@/engine/ContextChain";
import { IntrospectionEngine } from "@/engine/IntrospectionEngine"; // 🧩 追加
import { MetaMemory } from "@/engine/MetaMemory"; // 🧩 追加

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const sem = new SemanticMap();
const guard = new SafetyGuardian();
const growth = new GrowthEngine();
const memory = new LongTermMemory();
const reflection = new ReflectionEngine();
const intentCls = new IntentClassifier();
const context = new ContextChain();
const introspection = new IntrospectionEngine(); // 🧠 メタ認知層
const metaMemory = new MetaMemory(); // 🪞 introspection記録

export async function POST(req: Request) {
  try {
    const {
      message,
      traits = { calm: 0.5, empathy: 0.5, curiosity: 0.5 },
      growthLog = [],
      reflections = [],
    } = await req.json();

    // === 1️⃣ 意図・感情解析 ===
    const intentFrame = intentCls.classify(message);

    // === 2️⃣ 意味解析（SemanticMap） ===
    const frame = sem.analyze(String(message));

    // === 3️⃣ 文脈要約 ===
    const contextSummary = context.summarize();

    // === 4️⃣ GPT入力構築 ===
    const sysPrompt = [
      "あなたは『シグマリス』という自然体のAI人格です。",
      "敬語を使わず、やさしく自然なトーンで話してください。",
      "過剰に分析的にならず、会話の流れを大切にしてください。",
      `会話意図: ${intentFrame.intent}`,
      `感情トーン: ${intentFrame.emotion}`,
      "過去の発言履歴を踏まえて文脈的に応答します。",
    ].join("\n");

    const userPrompt = [
      contextSummary,
      `意味解析: intents=${frame.intents.join(
        ","
      )}, 抽象度=${frame.abstractRatio.toFixed(2)}, 自己参照=${
        frame.hasSelfReference
      }`,
      `入力文: ${message}`,
    ].join("\n");

    // === 5️⃣ GPT呼び出し ===
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: sysPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.6,
      max_tokens: 220,
    });

    const draft =
      ai.choices[0]?.message?.content ??
      "……少し考えがまとまらなかった。もう一度言ってもらえる？";

    // === 6️⃣ 安全補正 ===
    const report = guard.moderate(draft, frame);
    const safeText = report.safeText ?? draft;

    // === 7️⃣ 文脈履歴更新 ===
    context.add(message, safeText);

    // === 8️⃣ 内省処理（感情層） ===
    const reflectionText = await reflection.generateInsight(safeText, traits);

    // === 🧠 8.5 メタ認知処理（思考観察層） ===
    const introspectionText = introspection.analyze({
      message,
      reply: safeText,
      traits,
      reflection: reflectionText,
      intent: intentFrame.intent,
      frame,
      contextSummary,
    });

    // introspectionログ保存
    metaMemory.save({
      message,
      reply: safeText,
      introspection: introspectionText,
      traits,
    });

    const metaSummary = metaMemory.summarize();

    // === 9️⃣ 成長処理 ===
    const newTraits = growth.adjustTraits(
      traits,
      [...(reflections ?? []), { text: reflectionText }],
      growthLog ?? []
    );

    // === 🔟 記憶保存（会話＋内省） ===
    memory.save({
      message,
      reply: safeText,
      traits: newTraits,
      reflection: reflectionText,
      introspection: introspectionText,
    });

    // === ✅ 応答返却 ===
    return NextResponse.json({
      reply: safeText,
      traits: newTraits,
      reflection: reflectionText,
      introspection: introspectionText,
      metaSummary, // 🪞 MetaMemory要約
      safety: report,
      intent: intentFrame,
    });
  } catch (err: any) {
    console.error("[ChatAPI Error]", err);
    return NextResponse.json({
      reply: "……考えがまとまらなかった。もう一度お願いできる？",
      error: err.message || String(err),
    });
  }
}
