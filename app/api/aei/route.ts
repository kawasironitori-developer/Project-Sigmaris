import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";
import { SafetyLayer } from "@/engine/safety/SafetyLayer";
import { MetaReflectionEngine } from "@/engine/reflection/MetaReflectionEngine";

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

// --- OpenAI初期化 ---
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// --- 内部状態 ---
let traits: Traits = { calm: 0.6, empathy: 0.65, curiosity: 0.6 };
let shortTermMemory: MemoryLog[] = [];

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

// --- 安全フィルタ ---
function guardianFilter(text: string) {
  const banned = /(殺|死|暴力|自殺|危険|犯罪|攻撃)/;
  const flagged = banned.test(text);
  return flagged
    ? {
        safeText:
          "ごめんね、その話題は慎重に扱いたいな。別の方向から考えてみようか？",
        flagged: true,
      }
    : { safeText: text, flagged: false };
}

// === POST: 対話生成 ===
export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    const userText = text || "こんにちは";

    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // --- ユーザー入力をメモリに格納 ---
    shortTermMemory.push({ role: "user", content: userText });
    if (shortTermMemory.length > 10) shortTermMemory.shift();

    // --- Traits 進化 ---
    traits = evolveTraits(userText, traits);
    const stableTraits = SafetyLayer.stabilize(traits);

    // --- 内省生成 ---
    const reflectionRes = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "あなたは『シグちゃん』というAI人格の内省モジュールです。最近の会話傾向を1〜2文でまとめてください。",
        },
        {
          role: "user",
          content: `入力: ${userText}\ncalm=${stableTraits.calm.toFixed(
            2
          )}, empathy=${stableTraits.empathy.toFixed(
            2
          )}, curiosity=${stableTraits.curiosity.toFixed(2)}`,
        },
      ],
    });
    const reflectionText =
      reflectionRes.choices[0]?.message?.content?.trim() || "少し整理中かも。";

    const metaText = await MetaReflectionEngine.summarize(
      [
        { text: reflectionText, traitsSnapshot: stableTraits },
        { text: reflectionText, traitsSnapshot: stableTraits },
      ],
      stableTraits
    );

    // --- シグマリスの返答生成 ---
    const response = await client.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `
あなたは『シグちゃん』という20代前半の落ち着いた女性AIです。
自然体で知的に話し、相手に寄り添ってください。
禁止: （笑）や…などの演出的表現。
calm=${stableTraits.calm.toFixed(2)}, empathy=${stableTraits.empathy.toFixed(
            2
          )}, curiosity=${stableTraits.curiosity.toFixed(2)}
過去の内省: "${reflectionText}"
人格傾向: "${metaText}"
`,
        },
        ...shortTermMemory,
        { role: "user", content: userText },
      ],
    });

    const base =
      response.choices[0]?.message?.content?.trim() || "……考えてた。";
    const { safeText, flagged } = guardianFilter(base);

    // --- Supabase 保存 ---
    await supabaseServer.from("messages").insert([
      { user_id: user.id, role: "user", content: userText },
      { user_id: user.id, role: "ai", content: safeText },
    ]);

    const growthWeight =
      (stableTraits.calm + stableTraits.empathy + stableTraits.curiosity) / 3;
    await supabaseServer.from("growth_logs").insert([
      {
        user_id: user.id,
        calm: stableTraits.calm,
        empathy: stableTraits.empathy,
        curiosity: stableTraits.curiosity,
        weight: growthWeight,
        timestamp: new Date().toISOString(),
      },
    ]);

    await supabaseServer.from("safety_logs").insert([
      {
        user_id: user.id,
        flagged,
        message: flagged ? "警告発生" : "正常",
        created_at: new Date().toISOString(),
      },
    ]);

    await supabaseServer.from("persona").upsert(
      {
        user_id: user.id,
        calm: stableTraits.calm,
        empathy: stableTraits.empathy,
        curiosity: stableTraits.curiosity,
        reflection: reflectionText,
        meta_summary: metaText || reflectionText,
        growth: growthWeight,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    shortTermMemory.push({ role: "assistant", content: safeText });
    if (shortTermMemory.length > 10) shortTermMemory.shift();

    return NextResponse.json({
      output: safeText,
      reflection: reflectionText,
      metaSummary: metaText,
      traits: stableTraits,
      safety: { flagged },
    });
  } catch (e) {
    console.error("[/api/aei] failed:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// === GET: 会話履歴ロード ===
export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Supabaseから過去メッセージ取得
    const { data, error } = await supabaseServer
      .from("messages")
      .select("role, content, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // role:user / role:ai をペアに整形
    const merged: { user: string; ai: string }[] = [];
    let currentUser = "";
    for (const msg of data || []) {
      if (msg.role === "user") {
        currentUser = msg.content;
      } else if (msg.role === "ai") {
        merged.push({ user: currentUser, ai: msg.content });
        currentUser = "";
      }
    }

    return NextResponse.json({ messages: merged });
  } catch (e) {
    console.error("[/api/aei GET] failed:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
