// ===== /lib/summary.ts =====
"use server";

/**
 * summarize()
 * 履歴を要約するサーバー関数
 */

export async function summarize(messages: any[]): Promise<string> {
  if (!messages || messages.length === 0) return "";

  // ユーザーとAIのやり取りを連結
  const joined = messages
    .map((m) => `User: ${m.user}\nAI: ${m.ai}`)
    .join("\n\n");

  try {
    // 絶対URLを必ず作る（App Router での必須仕様）
    const base =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:3000";

    const url = `${base}/api/summary`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: joined }),
    });

    if (!res.ok) {
      console.error("Summary API returned:", res.status);
      return "";
    }

    const data = await res.json();
    return data.summary || "";
  } catch (err) {
    console.error("Summarization failed:", err);
    return "";
  }
}
