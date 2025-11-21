// /lib/guard.ts
"use server";

import { isBillingExempt, getPlanLimit } from "@/lib/plan";
import { getUsage, incrementUsage, checkTrialExpired } from "@/lib/usage";
import { getSupabaseServer } from "@/lib/supabaseServer";

/** B仕様：全 Sigmaris API を統一管理 */
export type GuardApiType =
  | "aei"
  | "reflect"
  | "identity"
  | "meta"
  | "value"
  | "introspect";

/** debug log */
async function debugLog(phase: string, payload: any) {
  try {
    const safe = JSON.parse(JSON.stringify(payload ?? {}));
    const supabase = getSupabaseServer();
    await supabase.from("debug_logs").insert([
      {
        phase,
        payload: safe,
        created_at: new Date().toISOString(),
      },
    ]);
    await new Promise((res) => setTimeout(res, 100));
  } catch (err) {
    console.error("⚠️ guard.debugLog failed:", err);
  }
}

/**
 * 🛡️ guardUsageOrTrial
 * ― API使用量 / トライアル制御（B仕様）
 */
export async function guardUsageOrTrial(
  user: {
    id: string;
    email?: string;
    plan?: string;
    trial_end?: string | null;
    is_billing_exempt?: boolean;
    credit_balance?: number;
  } | null,
  type: GuardApiType
): Promise<void> {
  const phase: any = { phase: "guard_start", type };

  try {
    if (!user) throw new Error("Unauthorized — user missing");

    await debugLog("guard_enter", {
      userId: user.id,
      type,
      plan: user.plan,
      trial_end: user.trial_end,
      credit_balance: user.credit_balance,
      is_billing_exempt: user.is_billing_exempt,
    });

    /* -----------------------------------------
     * 1) billing exempt → 無条件通過
     * -------------------------------------- */
    if (isBillingExempt(user)) {
      await debugLog("guard_bypass_billing_exempt", { userId: user.id });
      return;
    }

    /* -----------------------------------------
     * 2) プラン上限（PlanApiType と完全同期）
     * -------------------------------------- */
    const plan = user.plan || "free";
    const limit = getPlanLimit(plan, type); // ← GuardApiType を正式に許可

    const credit = user.credit_balance ?? 0;

    /* -----------------------------------------
     * 3) トライアル判定
     *    expired でも credit があれば通す
     * -------------------------------------- */
    let expired = false;
    try {
      expired = checkTrialExpired(user.trial_end);
    } catch {
      expired = false;
    }

    if (plan === "free" && expired) {
      if (credit > 0) {
        await debugLog("guard_trial_soft_pass", {
          userId: user.id,
          credit,
        });
      } else {
        await debugLog("guard_trial_expired_block", { userId: user.id });
        throw new Error("Trial expired — please upgrade your plan.");
      }
    }

    /* -----------------------------------------
     * 4) 使用回数
     * -------------------------------------- */
    const usage = await getUsage(user.id, type);

    await debugLog("guard_usage_check", {
      userId: user.id,
      type,
      usage,
      limit,
    });

    /* -----------------------------------------
     * 5) 上限超過
     * -------------------------------------- */
    if (usage >= limit) {
      await debugLog("guard_limit_reached", {
        userId: user.id,
        usage,
        limit,
      });
      throw new Error("Usage limit reached — please upgrade your plan.");
    }

    /* -----------------------------------------
     * 6) 使用回数 +1
     * -------------------------------------- */
    await incrementUsage(user.id, type);

    await debugLog("guard_increment", {
      userId: user.id,
      type,
      newUsage: usage + 1,
    });

    await debugLog("guard_exit", { userId: user.id, status: "success" });
  } catch (err: any) {
    phase.error = err?.message ?? String(err);
    await debugLog("guard_error", { phase });
    throw err;
  }
}
