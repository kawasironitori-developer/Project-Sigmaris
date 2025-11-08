// /lib/usage.ts
"use server";

import { getSupabaseServer } from "@/lib/supabaseServer";
import { plans } from "@/lib/plan";

/**
 * 🕒 期間キーを生成（日単位・月単位）
 */
function periodKey(type: "day" | "month"): string {
  const now = new Date();
  return type === "day"
    ? now.toISOString().slice(0, 10)
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * ⏳ 試用期間が切れているかチェック
 */
export function checkTrialExpired(trial_end?: string | null): boolean {
  if (!trial_end) return true;
  return new Date() > new Date(trial_end);
}

/**
 * 📊 使用回数を取得（なければ0を返す）
 */
export async function getUsage(
  userId: string,
  type: "aei" | "reflect"
): Promise<number> {
  const supabase = getSupabaseServer();

  const { data, error } = await supabase
    .from("usage_counters")
    .select("aei_calls, reflect_calls")
    .eq("user_id", userId)
    .eq("period", periodKey("month"))
    .single();

  if (error || !data) {
    console.warn("⚠️ getUsage error:", error);
    return 0;
  }

  // 🧩 型安全な参照（曖昧さ回避）
  const value =
    type === "aei"
      ? (data as { aei_calls?: number }).aei_calls ?? 0
      : (data as { reflect_calls?: number }).reflect_calls ?? 0;

  return value;
}

/**
 * ➕ 使用回数を +1
 */
export async function incrementUsage(
  userId: string,
  type: "aei" | "reflect"
): Promise<void> {
  const supabase = getSupabaseServer();
  const key = periodKey("month");

  // 現在の使用量を取得
  const currentUsage = await getUsage(userId, type);
  const nextUsage = currentUsage + 1;

  // upsertで更新または挿入
  const fieldName = `${type}_calls`;

  const { error } = await supabase.from("usage_counters").upsert(
    {
      user_id: userId,
      period: key,
      [fieldName]: nextUsage,
    },
    { onConflict: "user_id,period" }
  );

  if (error) {
    console.error(`⚠️ incrementUsage failed (${type}):`, error);
  } else {
    console.log(`✅ incrementUsage: ${fieldName} -> ${nextUsage}`);
  }
}
