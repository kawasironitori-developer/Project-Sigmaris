// /app/api/value/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import { getSupabaseServer } from "@/lib/supabaseServer";
import { PersonaSync } from "@/engine/sync/PersonaSync";
import type { TraitVector } from "@/lib/traits";

// Python AEI Core
import { value as valueCore } from "@/lib/sigmaris-api";

import { flushSessionMemory } from "@/lib/memoryFlush";
import { guardUsageOrTrial } from "@/lib/guard";

/* -----------------------------------------------------------
 * Debug Log
 * --------------------------------------------------------- */
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
    await new Promise((r) => setTimeout(r, 80));
  } catch (err) {
    console.error("debugLog failed:", err);
  }
}

/* -----------------------------------------------------------
 * POST /api/value
 * --------------------------------------------------------- */
export async function POST(req: Request) {
  const step: any = { phase: "start" };

  try {
    const sessionId = req.headers.get("x-session-id") || crypto.randomUUID();
    const now = new Date().toISOString();
    step.sessionId = sessionId;

    /* -----------------------------
     * Auth
     * --------------------------- */
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const supabase = getSupabaseServer();

    /* -----------------------------
     * Credit / Trial Check
     * --------------------------- */
    step.phase = "credit-check";

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("credit_balance, plan, trial_end, is_billing_exempt")
      .eq("auth_user_id", userId)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const currentCredits = profile.credit_balance ?? 0;

    if (currentCredits <= 0) {
      try {
        await guardUsageOrTrial(
          {
            id: userId,
            email: (user as any)?.email,
            plan: profile.plan,
            trial_end: profile.trial_end,
            is_billing_exempt: profile.is_billing_exempt,
            credit_balance: currentCredits,
          },
          "value"
        );
      } catch (err: any) {
        await debugLog("value_guard_block", { err: String(err) });

        return NextResponse.json({
          success: false,
          valueSummary: "💬 上限に達しました。アップグレードが必要です。",
          traits: null,
          safety: "blocked",
          sessionId,
        });
      }
    }

    /* -----------------------------
     * Value Core
     * --------------------------- */
    step.phase = "value-core";

    let valueRes: any = null;
    try {
      valueRes = await valueCore();
    } catch (err) {
      await debugLog("value_core_failed", { err: String(err) });
      throw new Error("ValueCore unreachable");
    }

    const valueSummary: string = valueRes?.value_summary ?? "";
    const traits: TraitVector | null = valueRes?.traits ?? null;
    const safety: string = valueRes?.safety ?? "normal";

    /* -----------------------------
     * PersonaSync.update (B仕様)
     * --------------------------- */
    step.phase = "persona-update";

    if (traits) {
      const growthWeight =
        (traits.calm + traits.empathy + traits.curiosity) / 3;

      await PersonaSync.update(
        {
          traits,
          summary: valueSummary,
          growth: growthWeight,
          timestamp: now,
          baseline: null,
          identitySnapshot: null,
        },
        userId
      );

      await supabase.from("growth_logs").insert([
        {
          user_id: userId,
          session_id: sessionId,
          calm: traits.calm,
          empathy: traits.empathy,
          curiosity: traits.curiosity,
          weight: growthWeight,
          created_at: now,
        },
      ]);
    }

    /* -----------------------------
     * safety_logs
     * --------------------------- */
    step.phase = "safety-log";

    await supabase.from("safety_logs").insert([
      {
        user_id: userId,
        session_id: sessionId,
        flagged: safety !== "normal",
        message: safety,
        created_at: now,
      },
    ]);

    /* -----------------------------
     * flush
     * --------------------------- */
    const flushResult = await flushSessionMemory(userId, sessionId, {
      threshold: 120,
      keepRecent: 25,
    });

    /* -----------------------------
     * credit decrement
     * --------------------------- */
    step.phase = "credit-decrement";

    const { data: newProfile } = await supabase
      .from("user_profiles")
      .update({ credit_balance: currentCredits - 1 })
      .eq("auth_user_id", userId)
      .select("credit_balance")
      .single();

    const creditAfter = newProfile?.credit_balance ?? currentCredits - 1;

    /* -----------------------------
     * 保存（ログ）
     * --------------------------- */
    step.phase = "save-value";

    await supabase.from("value_logs").insert([
      {
        user_id: userId,
        session_id: sessionId,
        value_summary: valueSummary,
        safety_status: safety,
        created_at: now,
      },
    ]);

    await debugLog("value_success", {
      userId,
      sessionId,
      valuePreview: valueSummary.slice(0, 60),
    });

    return NextResponse.json({
      success: true,
      valueSummary,
      traits,
      safety,
      flush: flushResult,
      creditAfter,
      sessionId,
      step,
    });
  } catch (err: any) {
    const safe = JSON.parse(
      JSON.stringify({ ...(step ?? {}), error: err?.message })
    );
    await debugLog("value_error", safe);

    return NextResponse.json(
      {
        success: false,
        valueSummary: "…価値処理がうまくできなかったみたい。",
        error: err?.message,
        step: safe,
      },
      { status: 500 }
    );
  }
}
