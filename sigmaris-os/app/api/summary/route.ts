import { NextResponse } from "next/server";
import OpenAI from "openai";

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

export async function POST(req: Request) {
  try {
    const { text } = (await req.json().catch(() => ({}))) as { text?: string };
    const openai = getOpenAI();
    if (!openai) return NextResponse.json({ summary: "" });

    const prompt = `次の会話ログを、日本語で短く要約してください（箇条書き可）。\n\n${String(
      text ?? ""
    )}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 200,
      temperature: 0.2,
    });

    const summary = completion.choices[0]?.message?.content?.trim() || "";
    return NextResponse.json({ summary });
  } catch (err: any) {
    console.error("Summary API failed:", err);
    return NextResponse.json(
      { error: "Summary generation failed", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
