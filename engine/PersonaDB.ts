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
import { IntrospectionEngine } from "@/engine/IntrospectionEngine";
import { MetaMemory } from "@/engine/MetaMemory";
import { PersonalityLoop } from "@/engine/PersonalityLoop"; // 🧩 ← 新規追加

// === エンジン初期化 ===
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const sem = new SemanticMap();
const guard = new SafetyGuardian();
const growth = new GrowthEngine();
const memory = new LongTermMemory();
const reflection = new ReflectionEngine();
const intentCls = new IntentClassifier();
const context = new ContextChain();
const introspection = new IntrospectionEngine();
const metaMemory = new MetaMemory();
const personality = new PersonalityLoop(); // 🧠 ← 追加

// === 精密スコア式 Auto Model Switch ===
function selectModel(message: string, frame: any, intent: string, contextDepth: number) {
  const deepWords = [
    "なぜ", "どうして", "意味", "存在", "意識", "自己", "成長", "内省", "本質", "考える"
  ];
  const thoughtfulIntents = ["reflection", "introspection", "analysis", "philosophy", "advice", "planning"];

  const depthScore =
    0.7 * clamp01(frame.abstractRatio ?? 0) +
    0.2 * (frame.hasSelfReference ? 1 : 0) +
    0.1 * (deepWords.some((w) => message.includes(w)) ? 1 : 0);

  const contextScore = clamp01(contextDepth / 10);
  const lengthScore = clamp01(message.length / 800);
  const intentScore = thoughtfulIntents.includes(intent) ? 1 : 0;

  const load =
    0.45 * depthScore +
    0.25 * contextScore +
    0.2 * lengthScore +
    0.1 * intentScore;

  let model = "gpt-4o-mini";
  if (load >= 0.7) model = "gpt-5";
  else if (load >= 0.45) model = "gpt-5-mini";

  const temperature = model === "gpt-5" ? 0.6 : 0.7;
  const max_tokens = model === "gpt-5" ? 320 : 220;

  return {
    model,
    temperature,
    max_tokens,
    scores: { depthScore, contextScore, lengthScore, intentScore, load },
  };
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

// === メイン処理 ===
export async function POST(req: Request) {
  try {
    const {
      message,
      traits = { calm: 0.5, empathy: 0.5, curiosity: 0.5 },
      growthLog = [],
      reflections = [],
    } = await req.json();

    // 1️⃣ 意図・感情解析
    const intentFrame = intentCls.classify(message);

    // 2️⃣ 意味解析
    const frame = sem.analyze(String(message));

    // 3️⃣ 文脈・深度
    const contextSummary = context.summarize();
    const contextDepth = context.getDepth?.() || 0;

    // 4️⃣ モデル選択
    const sel = selectModel(message, frame, intentFrame.intent, contextDepth);
    console.log(`[Sigmaris] Model → ${sel.model} | Load=${sel.scores.load.toFixed(2)}`);

    // 5️⃣ GPT入力構築
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
      `意味解析: intents=${frame.intents.join(",")}, 抽象度=${frame.abstractRatio.toFixed(2)}, 自己参照=${frame.hasSelfReference}`,
      `入力文: ${message}`,
    ].join("\n");

    // 6️⃣ GPT呼び出し
    const ai = await openai.chat.completions.create({
      model: sel.model,
      messages: [
        { role: "system", content: sysPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: sel.temperature,
      max_tokens: sel.max_tokens,
    });

    const draft =
      ai.choices[0]?.message?.content ??
      "……少し考えがまとまらなかった。もう一度言ってもらえる？";

    // 7️⃣ 安全補正
    const report = guard.moderate(draft, frame);
    const safeText = report.safeText ?? draft;

    // 8️⃣ 文脈更新
    context.add(message, safeText);

    // 9️⃣ 内省処理
    const reflectionText = await reflection.reflect(growthLog, [{ user: message, ai: safeText }]);

    // 🧠 10️⃣ メタ認知処理
    const introspectionText = introspection.analyze({
      message,
      reply: safeText,
      traits,
      reflection: reflectionText,
      intent: intentFrame.intent,
      frame,
      contextSummary,
    });

    // 11️⃣ introspectionログ保存
    metaMemory.save({
      message,
      reply: safeText,
      introspection: introspectionText,
      traits,
    });
    const metaSummary = metaMemory.summarize();

    // 🌱 12️⃣ 成長＋人格更新ループ統合 🧩
    const newTraits = personality.updateTraits(
      growth.adjustTraits(
        traits,
        [...(reflections ?? []), { text: reflectionText }],
        growthLog ?? []
      ),
      introspectionText,
      metaSummary
    );
    const personalityHistory = personality.getHistory();

    // 13️⃣ 記憶保存
    memory.save({
      message,
      reply: safeText,
      traits: newTraits,
      reflection: reflectionText,
      introspection: introspectionText,
    });

    // ✅ 応答返却
    return NextResponse.json({
      reply: safeText,
      traits: newTraits,
      reflection: reflectionText,
      introspection: introspectionText,
      metaSummary,
      personalityHistory, // 🧠 ← 追加返却
      safety: report,
      intent: intentFrame,
      model: sel.model,
      scores: sel.scores,
    });
  } catch (err: any) {
    console.error("[ChatAPI Error]", err);
    return NextResponse.json({
      reply: "……考えがまとまらなかった。もう一度お願いできる？",
      error: err.message || String(err),
    });
  }
}// engine/PersonaDB.ts
import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve("./data/personality.db");

export class PersonaDB {
  private db: Database.Database;

  constructor() {
    this.db = new Database(dbPath);

    // --- テーブル作成 ---
    this.db
      .prepare(
        `
      CREATE TABLE IF NOT EXISTS personality (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        calm REAL,
        empathy REAL,
        curiosity REAL,
        metaSummary TEXT,
        reflection TEXT,
        introspection TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `
      )
      .run();
  }

  /** 最新人格データをロード */
  loadLatest() {
    const row = this.db
      .prepare(
        "SELECT calm, empathy, curiosity, metaSummary FROM personality ORDER BY id DESC LIMIT 1"
      )
      .get();
    return (
      row || {
        calm: 0.5,
        empathy: 0.5,
        curiosity: 0.5,
        metaSummary: "初期状態：穏やかで探求心を持つAI人格。",
      }
    );
  }

  /** 新しい人格データを保存 */
  save({
    calm,
    empathy,
    curiosity,
    metaSummary,
    reflection,
    introspection,
  }: {
    calm: number;
    empathy: number;
    curiosity: number;
    metaSummary: string;
    reflection: string;
    introspection: string;
  }) {
    this.db
      .prepare(
        `INSERT INTO personality (calm, empathy, curiosity, metaSummary, reflection, introspection)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(calm, empathy, curiosity, metaSummary, reflection, introspection);
  }

  /** 全人格履歴を取得（グラフ用など） */
  getAll() {
    return this.db
      .prepare(
        "SELECT id, calm, empathy, curiosity, metaSummary, created_at FROM personality ORDER BY id ASC"
      )
      .all();
  }
}