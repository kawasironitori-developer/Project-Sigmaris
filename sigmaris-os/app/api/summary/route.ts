// ===== /app/api/summary/route.ts =====
import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    const prompt = `
次の会話履歴を100〜200文字で簡潔に要約してください。
内容の本質・トーン・構造を維持すること：

${text}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
    });

    const summary = completion.choices[0]?.message?.content?.trim() || "";
    return NextResponse.json({ summary });
  } catch (err) {
    console.error("Summary API failed:", err);
    return NextResponse.json(
      { error: "Summary generation failed" },
      { status: 500 }
    );
  }
}
