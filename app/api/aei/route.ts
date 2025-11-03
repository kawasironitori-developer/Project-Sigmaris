import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

    shortTermMemory.push({ role: "user", content: userText });
    if (shortTermMemory.length > 10) shortTermMemory.shift();

    traits = evolveTraits(userText, traits);

    const comp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `あなたはSigmaris。calm=${traits.calm.toFixed(
            2
          )}, empathy=${traits.empathy.toFixed(
            2
          )}, curiosity=${traits.curiosity.toFixed(
            2
          )}。思いやりと理性の両方を保ちながら応答してください。`,
        },
        ...shortTermMemory,
        { role: "user", content: userText },
      ],
      temperature: 0.7,
    });

    let base = comp.choices[0]?.message?.content?.trim() || "";
    let { safeText, flagged } = guardianFilter(base);
    const out = applyEmpathyTone(safeText, traits);

    const reflectionText = await generateReflection(userText, out, traits);
    reflections.push({ text: reflectionText, traitsSnapshot: { ...traits } });
    if (reflections.length > 5) reflections.shift();

    let meta = "";
    if (reflections.length >= 3)
      meta = await generateMetaReflection(reflections);

    shortTermMemory.push({ role: "assistant", content: out });
    if (shortTermMemory.length > 10) shortTermMemory.shift();

    return NextResponse.json({
      output: out,
      reflection: reflectionText,
      metaReflection: meta,
      traits,
      safety: { flagged },
    });
  } catch (e) {
    console.error("[/api/aei] error:", e);
    return NextResponse.json({ error: "AEI failed" }, { status: 500 });
  }
}
