// /lib/guard.ts
"use server";

import { isBillingExempt, getPlanLimit } from "@/lib/plan";
import { getUsage, incrementUsage, checkTrialExpired } from "@/lib/usage";
import { getSupabaseServer } from "@/lib/supabaseServer";

/** 🪶 デバッグログをSupabaseに保存 */
async function debugLog(phase: string, payload: any) {
  try {
    const supabase = getSupabaseServer();
    await supabase.from("debug_logs").insert([{ phase, payload }]);
  } catch (err) {
    console.error("⚠️ guard debugLog insert failed:", err);
  }
}

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
  const phase: any = { phase: "guard_start", type };
  try {
    if (!user) throw new Error("Unauthorized — user not found");

    await debugLog("guard_enter", {
      userId: user.id,
      email: user.email,
      type,
      plan: user.plan,
      trial_end: user.trial_end,
    });

    // 🔓 開発者・免除ユーザー判定
    if (isBillingExempt(user)) {
      await debugLog("guard_bypass", { userId: user.id, email: user.email });
      return;
    }

    // 📦 現在プラン情報取得
    const plan = user.plan || "free";
    const limit = getPlanLimit(plan, type);

    let expired = false;
    try {
      expired = checkTrialExpired(user.trial_end);
    } catch (e: any) {
      await debugLog("guard_trial_check_error", {
        userId: user.id,
        message: e?.message || String(e),
      });
      expired = false; // 失敗時は安全側に通す
    }

    // ⏳ 試用期間終了チェック
    if (plan === "free" && expired) {
      await debugLog("guard_trial_expired", {
        userId: user.id,
        email: user.email,
        plan,
        trial_end: user.trial_end,
      });
      throw new Error("Trial expired — please upgrade your plan.");
    }

    // 📊 現在の使用量取得
    const usage = await getUsage(user.id, type);
    await debugLog("guard_usage_check", {
      userId: user.id,
      type,
      usage,
      limit,
    });

    // 🚧 上限超過チェック
    if (usage >= limit) {
      await debugLog("guard_limit_reached", {
        userId: user.id,
        usage,
        limit,
      });
      throw new Error("Usage limit reached — please upgrade your plan.");
    }

    // ➕ 使用回数加算
    await incrementUsage(user.id, type);
    await debugLog("guard_increment", {
      userId: user.id,
      type,
      newUsage: usage + 1,
      limit,
    });

    await debugLog("guard_exit", { userId: user.id, status: "success" });
  } catch (err: any) {
    phase.error = err?.message;
    await debugLog("guard_error", { phase, message: err?.message });
    throw err;
  }
}
