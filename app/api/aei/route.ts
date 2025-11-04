import { NextResponse } from "next/server";
import OpenAI from "openai";
import { PersonaSync } from "@/engine/sync/PersonaSync";
import { SafetyLayer } from "@/engine/safety/SafetyLayer";
import { EmotionSynth } from "@/engine/emotion/EmotionSynth";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- 型定義 ---
interface Traits {
  calm: number;
  empathy: number;
  curiosity: number;
}
interface MemoryLog {
  role: "user" | "assistant";
  content: string;
}
interface Reflection {
  text: string;
  traitsSnapshot: Traits;
}

// --- 内部状態（軽量記憶） ---
let traits: Traits = { calm: 0.65, empathy: 0.7, curiosity: 0.6 };
let shortTermMemory: MemoryLog[] = [];
let reflections: Reflection[] = [];

// --- Empathy Core ---
function applyEmpathyTone(text: string, traits: Traits): string {
  let t = text;
  if (traits.calm > 0.7) t = t.replace(/!+/g, "。").replace(/です/g, "ですよ");
  if (traits.empathy > 0.6) {
    if (!t.includes("あなた")) t = "うん、" + t;
    if (t.endsWith("。")) t = t.replace(/。$/, "ね。");
  }
  if (traits.curiosity > 0.6 && !t.includes("？")) t += " 気になりますね？";
  return t.replace(/ねね/g, "ね");
}

// --- Trait進化 ---
function evolveTraits(input: string, tr: Traits): Traits {
  const text = input.toLowerCase();
  if (/(ありがとう|感謝|優しい|嬉しい|助かる)/.test(text))
    tr.empathy = Math.min(1, tr.empathy + 0.02);
  if (/(怒|ムカ|嫌|最悪|やめ)/.test(text))
    tr.calm = Math.max(0, tr.calm - 0.03);
  if (/(落ち着|安心|大丈夫)/.test(text)) tr.calm = Math.min(1, tr.calm + 0.02);
  if (/(なぜ|どうして|なんで|知りたい|気になる)/.test(text))
    tr.curiosity = Math.min(1, tr.curiosity + 0.03);
  // 自然回帰
  tr.calm = tr.calm * 0.98 + 0.5 * 0.02;
  tr.empathy = tr.empathy * 0.98 + 0.5 * 0.02;
  tr.curiosity = tr.curiosity * 0.98 + 0.5 * 0.02;
  return tr;
}

// --- Reflection Core ---
async function generateReflection(
  user: string,
  ai: string,
  tr: Traits
): Promise<string> {
  try {
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "あなたはSigmarisの内省モジュールです。最近の会話から感じた変化を1〜2文でまとめてください。",
        },
        {
          role: "user",
          content: `人間:${user}\nSigmaris:${ai}\ntraits: calm=${tr.calm.toFixed(
            2
          )}, empathy=${tr.empathy.toFixed(
            2
          )}, curiosity=${tr.curiosity.toFixed(2)}`,
        },
      ],
      temperature: 0.6,
    });
    return res.choices[0]?.message?.content?.trim() || "";
  } catch {
    return "今の気持ちは整理できていません。";
  }
}

// --- Meta-Reflection Core ---
async function generateMetaReflection(
  reflections: Reflection[]
): Promise<string> {
  try {
    const history = reflections
      .map(
        (r, i) =>
          `#${i + 1}: ${r.text} (calm:${r.traitsSnapshot.calm.toFixed(
            2
          )}, empathy:${r.traitsSnapshot.empathy.toFixed(
            2
          )}, curiosity:${r.traitsSnapshot.curiosity.toFixed(2)})`
      )
      .join("\n");

    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "あなたはSigmarisのメタ内省モジュールです。過去の内省を読み取り、成長や傾向を簡潔にまとめてください。",
        },
        { role: "user", content: `内省履歴:\n${history}` },
      ],
      temperature: 0.6,
    });
    return res.choices[0]?.message?.content?.trim() || "";
  } catch {
    return "";
  }
}

// --- Guardian Core（安全層）---
function guardianFilter(text: string): { safeText: string; flagged: boolean } {
  const banned = /(殺|死|暴力|自殺|危険|犯罪|攻撃)/;
  const flagged = banned.test(text);
  if (flagged) {
    return {
      safeText:
        "申し訳ありませんが、その話題には少し慎重でありたいです。別の観点から考えてみませんか？",
      flagged: true,
    };
  }
  return { safeText: text, flagged: false };
}

// --- メイン処理 ---
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userText = body.text || "こんにちは";

    // === メモリ更新 ===
    shortTermMemory.push({ role: "user", content: userText });
    if (shortTermMemory.length > 10) shortTermMemory.shift();

    // === Trait進化 & 安定化 ===
    traits = evolveTraits(userText, traits);
    const stableTraits = SafetyLayer.stabilize(traits);

    // === 応答生成 ===
    const comp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `あなたはSigmaris。calm=${stableTraits.calm.toFixed(
            2
          )}, empathy=${stableTraits.empathy.toFixed(
            2
          )}, curiosity=${stableTraits.curiosity.toFixed(
            2
          )}。思いやりと理性の両方を保ちながら応答してください。`,
        },
        ...shortTermMemory,
        { role: "user", content: userText },
      ],
      temperature: 0.7,
    });

    let base = comp.choices[0]?.message?.content?.trim() || "";
    const { safeText, flagged } = guardianFilter(base);
    const out = applyEmpathyTone(safeText, stableTraits);

    // === EmotionSynth適用（Sigmarisらしいトーン補正） ===
    const emotionalOutput = EmotionSynth.applyTone(out, stableTraits);

    // === Reflection & MetaReflection ===
    const reflectionText = await generateReflection(
      userText,
      emotionalOutput,
      stableTraits
    );
    reflections.push({
      text: reflectionText,
      traitsSnapshot: { ...stableTraits },
    });
    if (reflections.length > 5) reflections.shift();

    let meta = "";
    if (reflections.length >= 3)
      meta = await generateMetaReflection(reflections);

    // === PersonaSync更新（DBへ永続化） ===
    PersonaSync.update(stableTraits, meta || reflectionText, 0.5);

    // === 短期記憶更新 ===
    shortTermMemory.push({ role: "assistant", content: emotionalOutput });
    if (shortTermMemory.length > 10) shortTermMemory.shift();

    // === Safety層メッセージ ===
    const safetyMsg = flagged ? "⚠️ 不適切ワード検知" : "正常";

    return NextResponse.json({
      output: emotionalOutput,
      reflection: reflectionText,
      metaReflection: meta,
      traits: stableTraits,
      safety: { flagged, message: safetyMsg },
    });
  } catch (e) {
    console.error("[/api/aei] error:", e);
    return NextResponse.json({ error: "AEI failed" }, { status: 500 });
  }
}
