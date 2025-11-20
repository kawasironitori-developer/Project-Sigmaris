// /lib/memoryFlush.ts
"use server";

import { getSupabaseServer } from "@/lib/supabaseServer";
import { summarize } from "@/lib/summary";

/**
 * flushSessionMemory()
 * ─────────────────────────────────────────────
 * 会話履歴が閾値を超えた場合、先頭側を圧縮して summary に統合し、元メッセージを削除する。
 *
 * @param userId    Supabase user_id（必須）
 * @param sessionId セッションID
 * @param options   { threshold, keepRecent, maxChars }
 */
export async function flushSessionMemory(
  userId: string,
  sessionId: string,
  options?: {
    threshold?: number;
    keepRecent?: number;
    maxChars?: number;
  }
): Promise<{
  didFlush: boolean;
  deletedCount: number;
  keptCount: number;
  summary?: string;
}> {
  const threshold = options?.threshold ?? 120; // これを超えたら圧縮
  const keepRecent = options?.keepRecent ?? 24; // 末尾（新しい方）に残す件数
  const maxChars = options?.maxChars ?? 4000; // 要約入力の最大長（超えたら切り詰め）

  const supabase = getSupabaseServer();

  // id を含めて取得（削除用）
  const { data: rows, error } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("[memoryFlush] select error:", error.message);
    return { didFlush: false, deletedCount: 0, keptCount: 0 };
  }

  const all = rows ?? [];
  const total = all.length;

  if (total <= threshold) {
    return { didFlush: false, deletedCount: 0, keptCount: total };
  }

  // 末尾 keepRecent 件は残す → それより前を圧縮対象とする
  const cutIndex = Math.max(0, total - keepRecent);
  const toSummarize = all.slice(0, cutIndex);
  const toKeep = all.slice(cutIndex);

  // DB → 要約用の {user, ai} 配列に整形
  const pairs: Array<{ user: string; ai: string }> = [];
  let currentUser = "";
  for (const r of toSummarize) {
    if (r.role === "user") currentUser = r.content ?? "";
    if (r.role === "ai") pairs.push({ user: currentUser, ai: r.content ?? "" });
  }

  // 文字数が多すぎる場合に安全に切る（LLM帯域保護）
  let inputForSummary = pairs;
  if (JSON.stringify(pairs).length > maxChars) {
    // 古い方から詰めて、maxCharsに収まるところまで使う
    const compact: typeof pairs = [];
    let accLen = 0;
    for (let i = 0; i < pairs.length; i++) {
      const chunk = JSON.stringify(pairs[i]);
      if (accLen + chunk.length > maxChars) break;
      accLen += chunk.length;
      compact.push(pairs[i]);
    }
    inputForSummary = compact;
  }

  // /lib/summary.ts を用いて要約生成
  let summary = "";
  try {
    summary = await summarize(inputForSummary as any[]);
  } catch (e) {
    console.warn("[memoryFlush] summarize failed, fallback to simple trim.");
    // 失敗時は超簡易連結
    summary = inputForSummary
      .map((m) => `User: ${m.user}\nAI: ${m.ai}`)
      .join("\n\n")
      .slice(0, 1200);
  }

  // summaries テーブルに履歴として保存（存在しない環境でも握りつぶす）
  try {
    const now = new Date().toISOString();
    await supabase.from("summaries").insert([
      {
        user_id: userId,
        session_id: sessionId,
        summary,
        created_at: now,
      },
    ]);
  } catch (e) {
    // テーブル未作成などはワーニングのみ
    console.warn(
      "[memoryFlush] summaries insert skipped:",
      (e as any)?.message
    );
  }

  // 圧縮対象の messages を削除（id 指定で安全）
  const idsToDelete = toSummarize.map((r) => r.id);
  let deletedCount = 0;
  if (idsToDelete.length > 0) {
    const { error: delErr, count } = await supabase
      .from("messages")
      .delete({ count: "exact" })
      .in("id", idsToDelete);
    if (delErr) {
      console.warn("[memoryFlush] delete error:", delErr.message);
    } else {
      deletedCount = count ?? idsToDelete.length;
    }
  }

  return {
    didFlush: true,
    deletedCount,
    keptCount: toKeep.length,
    summary,
  };
}
