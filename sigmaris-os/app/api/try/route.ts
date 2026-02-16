// /app/api/try/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

// 任意: .env で上書き
const TRY_COOLDOWN_MS = Number(process.env.TRY_COOLDOWN_MS || 15000);
const TRY_MODEL = process.env.TRY_MODEL || "gpt-5-mini";

// メモリ簡易レートリミット（サーバレスだと弱い＝ソフトガード）
const recentMap = new Map<string, number>();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function guardianFilter(text: string) {
  const banned = /(殺|死|暴力|自殺|危険|犯罪|攻撃)/;
  const flagged = banned.test(text);
  return flagged
    ? {
        safeText:
          "ごめん、ここではその話題は扱えないよ。別の切り口で試してみよう。",
        flagged: true,
      }
    : { safeText: text, flagged: false };
}

export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    const userText = (text ?? "").toString().trim().slice(0, 800);
    if (!userText) {
      return NextResponse.json(
        { error: "テキストが空です。" },
        { status: 400 }
      );
    }

    // ソフト・レートリミット（IP+日）
    const ip =
      req.headers.get("x-forwarded-for") || (req as any).ip || "0.0.0.0";
    const key = `${ip}-${new Date().toDateString()}`;
    const now = Date.now();
    const last = recentMap.get(key) || 0;
    const diff = now - last;

    if (diff < TRY_COOLDOWN_MS) {
      const remain = Math.ceil((TRY_COOLDOWN_MS - diff) / 1000);
      const r = NextResponse.json(
        { error: `クールダウン中。${remain}s 後に再試行してください。` },
        { status: 429 }
      );
      r.headers.set("X-Cooldown-Seconds", String(remain));
      return r;
    }
    recentMap.set(key, now);

    // 体験用の簡易プロンプト
    const systemPrompt = `
あなたは『シグちゃん』という自然体の会話AI。砕けすぎず、誠実で簡潔。
相手の文からキーワードを拾って、優しく1〜3段落で返答する。
禁止: 過度な内輪ノリ・絵文字連打・過激表現
    `.trim();

    const completion = await client.chat.completions.create({
      model: TRY_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      temperature: 0.7,
      max_completion_tokens: 320,
    });

    const raw =
      completion.choices[0]?.message?.content?.trim() || "……少し考えさせてね。";
    const { safeText } = guardianFilter(raw);

    const res = NextResponse.json({ output: safeText, success: true });
    res.headers.set(
      "X-Cooldown-Seconds",
      String(Math.ceil(TRY_COOLDOWN_MS / 1000))
    );
    return res;
  } catch (e: any) {
    console.error("[/api/try] failed:", e);
    return NextResponse.json(
      { error: "内部エラー。時間を置いて再試行してください。" },
      { status: 500 }
    );
  }
}

export async function GET() {
  // 健康チェック
  return NextResponse.json({ ok: true });
}
