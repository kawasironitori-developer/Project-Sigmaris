import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const { text, targetLang } = await req.json();

    if (!text || !targetLang)
      return NextResponse.json(
        { error: "Missing parameters" },
        { status: 400 }
      );

    // ===== 翻訳プロンプト =====
    const prompt = `
Translate the following text into ${targetLang} in a natural and accurate way.
Keep the meaning exactly the same, do not summarize or alter the tone.

Text:
${text}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    const translation = response.choices[0]?.message?.content?.trim() || text;

    return NextResponse.json({ translation });
  } catch (err: any) {
    console.error("Translation API error:", err);
    return NextResponse.json(
      { error: "Translation failed", detail: err.message },
      { status: 500 }
    );
  }
}
