// /lib/guard.ts
"use server";

import { isBillingExempt, getPlanLimit } from "@/lib/plan";
import { getUsage, incrementUsage, checkTrialExpired } from "@/lib/usage";

/**
 * 🛡️ APIガード — 無料試用・上限・課金制御
 *
 * 呼び出し例：
 * await guardUsageOrTrial(user, "aei");
 */
export async function guardUsageOrTrial(
  user: {
    id: string;
    email?: string;
    plan?: string;
    trial_end?: string | null;
    is_billing_exempt?: boolean;
  } | null,
  type: "aei" | "reflect"
): Promise<void> {
  if (!user) throw new Error("Unauthorized — user not found");

  // 🔓 開発者・免除ユーザー判定
  if (isBillingExempt(user)) {
    console.log(`💳 Billing bypass for: ${user.email ?? "unknown user"}`);
    return; // 制限スキップ
  }

  // 📦 現在プラン情報取得
  const plan = user.plan || "free";
  const limit = getPlanLimit(plan, type);
  const expired = checkTrialExpired(user.trial_end);

  // ⏳ 試用期間終了チェック
  if (plan === "free" && expired) {
    console.warn(`⛔ Trial expired for user: ${user.email ?? user.id}`);
    throw new Error("Trial expired — please upgrade your plan.");
  }

  // 📊 現在の使用量取得
  const usage = await getUsage(user.id, type);
  console.log(`📈 Usage check → ${type}: ${usage}/${limit}`);

  // 🚧 上限超過チェック
  if (usage >= limit) {
    console.warn(`⚠️ Usage limit reached for ${user.email ?? user.id}`);
    throw new Error("Usage limit reached — please upgrade your plan.");
  }

  // ➕ 使用回数加算
  await incrementUsage(user.id, type);
  console.log(`✅ Usage incremented → ${type} now ${usage + 1}/${limit}`);
}
