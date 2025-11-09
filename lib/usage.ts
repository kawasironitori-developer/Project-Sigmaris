/**
 * 🕒 シグマリスOS — 利用状況・試用期間ユーティリティ
 * 各APIで import { checkTrialExpired, getUsage, incrementUsage } from "@/lib/usage";
 */

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
  const end = new Date(trial_end);
  if (isNaN(end.getTime())) return true;
  return new Date() > end;
}

/**
 * 📊 使用回数を取得（なければ0を返す）
 */
export async function getUsage(
  userId: string,
  type: "aei" | "reflect"
): Promise<number> {
  if (!userId) {
    console.warn("⚠️ getUsage called without userId");
    return 0;
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    console.error("❌ Supabase client not initialized");
    return 0;
  }

  const { data, error } = await supabase
    .from("usage_counters")
    .select("aei_calls, reflect_calls")
    .eq("user_id", userId)
    .eq("period", periodKey("month"))
    .maybeSingle(); // 安全な1件取得

  if (error) {
    console.warn("⚠️ getUsage error:", error.message);
    return 0;
  }

  if (!data) return 0;

  // 型安全に値を取得
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
  if (!userId) {
    console.error("❌ incrementUsage called without userId");
    return;
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    console.error("❌ Supabase client not initialized");
    return;
  }

  const key = periodKey("month");
  const currentUsage = await getUsage(userId, type);
  const nextUsage = currentUsage + 1;
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
    console.error(`⚠️ incrementUsage failed (${type}):`, error.message);
  } else {
    console.log(`✅ incrementUsage: ${fieldName} -> ${nextUsage}`);
  }
}
