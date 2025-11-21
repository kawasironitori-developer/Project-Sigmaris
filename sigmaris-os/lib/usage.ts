/**
 * 🕒 Sigmaris OS — 利用状況 / 試用期間ユーティリティ（B仕様・6API完全対応版）
 */

import { getSupabaseServer } from "@/lib/supabaseServer";
import type { GuardApiType } from "@/lib/guard";

/**
 * 🕒 期間キー生成（月単位）
 */
function periodKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * ⏳ トライアル終了チェック（安全設計）
 */
export function checkTrialExpired(trial_end?: string | null): boolean {
  try {
    if (!trial_end) return false;

    const end = new Date(trial_end);
    if (isNaN(end.getTime())) return false;

    return Date.now() > end.getTime();
  } catch {
    return false;
  }
}

/**
 * 📊 Usage 取得（存在しない列/レコードは0扱い）
 */
export async function getUsage(
  userId: string,
  type: GuardApiType
): Promise<number> {
  if (!userId) return 0;

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("usage_counters")
    .select(
      `
      aei_calls,
      reflect_calls,
      identity_calls,
      meta_calls,
      value_calls,
      introspect_calls
    `
    )
    .eq("user_id", userId)
    .eq("period", periodKey())
    .maybeSingle();

  if (error || !data) return 0;

  const map: Record<GuardApiType, number> = {
    aei: data.aei_calls ?? 0,
    reflect: data.reflect_calls ?? 0,
    identity: data.identity_calls ?? 0,
    meta: data.meta_calls ?? 0,
    value: data.value_calls ?? 0,
    introspect: data.introspect_calls ?? 0,
  };

  return map[type] ?? 0;
}

/**
 * ➕ Usage +1（存在しないカラムも自動生成して書き込み）
 */
export async function incrementUsage(
  userId: string,
  type: GuardApiType
): Promise<void> {
  if (!userId) return;

  const supabase = getSupabaseServer();
  const period = periodKey();

  const current = await getUsage(userId, type);
  const next = current + 1;

  const fieldName = `${type}_calls`;

  const payload: any = {
    user_id: userId,
    period,
    [fieldName]: next,
  };

  const { error } = await supabase.from("usage_counters").upsert(payload, {
    onConflict: "user_id,period",
  });

  if (error) {
    console.error(`⚠️ incrementUsage failed (${type}):`, error.message);
  }
}
