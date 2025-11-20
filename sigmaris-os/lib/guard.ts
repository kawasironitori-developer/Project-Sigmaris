// /lib/guard.ts
"use server";

import { isBillingExempt, getPlanLimit } from "@/lib/plan";
import { getUsage, incrementUsage, checkTrialExpired } from "@/lib/usage";
import { getSupabaseServer } from "@/lib/supabaseServer";

/** 🪶 デバッグログをSupabaseに保存（undefined除去＋flush保証） */
async function debugLog(phase: string, payload: any) {
  try {
    const safePayload = JSON.parse(JSON.stringify(payload ?? {}));
    const supabase = getSupabaseServer();
    await supabase.from("debug_logs").insert([
      {
        phase,
        payload: safePayload,
        created_at: new Date().toISOString(),
      },
    ]);
    await new Promise((res) => setTimeout(res, 100)); // serverless書き込み保証
  } catch (err) {
    console.error("⚠️ guard debugLog insert failed:", err);
  }
}

/**
 * 🛡️ APIガード — 無料試用・上限・課金制御
 * ※ Reflect 側の挙動に合わせ、Trial expired は「課金残高がある場合は例外をスローせず通過」仕様
 *
 * 呼び出し例：
 * await guardUsageOrTrial(user, "reflect");
 */
export async function guardUsageOrTrial(
  user: {
    id: string;
    email?: string;
    plan?: string;
    trial_end?: string | null;
    is_billing_exempt?: boolean;
    credit_balance?: number; // reflectから渡せるよう追加
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
      credit_balance: user.credit_balance,
      is_billing_exempt: user.is_billing_exempt,
    });

    // 🔓 課金免除ユーザー判定
    if (isBillingExempt(user)) {
      await debugLog("guard_bypass", {
        userId: user.id,
        reason: "billing_exempt",
      });
      return;
    }

    // 📦 プランと上限
    const plan = user.plan || "free";
    const limit = getPlanLimit(plan, type);
    const credit = user.credit_balance ?? 0;

    // ⏳ 試用期間の有効判定
    let expired = false;
    try {
      expired = checkTrialExpired(user.trial_end);
    } catch (e: any) {
      await debugLog("guard_trial_check_error", {
        userId: user.id,
        message: e?.message || String(e),
      });
      expired = false; // 判定失敗時は安全側（通す）
    }

    // Trial expired の扱い（課金残高があれば通す）
    if (plan === "free" && expired) {
      if (credit > 0) {
        await debugLog("guard_trial_soft_bypass", {
          userId: user.id,
          plan,
          credit,
          trial_end: user.trial_end,
          reason: "Trial expired but has credit",
        });
      } else {
        await debugLog("guard_trial_expired", {
          userId: user.id,
          plan,
          trial_end: user.trial_end,
        });
        throw new Error("Trial expired — please upgrade your plan.");
      }
    }

    // 📊 使用回数取得
    const usage = await getUsage(user.id, type);
    await debugLog("guard_usage_check", {
      userId: user.id,
      type,
      usage,
      limit,
    });

    // 🚧 上限超過
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
