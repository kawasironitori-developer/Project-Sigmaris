// /app/api/identity/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import { getSupabaseServer } from "@/lib/supabaseServer";
import { PersonaSync } from "@/engine/sync/PersonaSync";

import type { TraitVector } from "@/lib/traits";
import { getIdentity as identityCore } from "@/lib/sigmaris-api";

import { flushSessionMemory } from "@/lib/memoryFlush";
import { guardUsageOrTrial } from "@/lib/guard";

/* -----------------------------------------------------
 * debugLog
 * --------------------------------------------------- */
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

    await new Promise((r) => setTimeout(r, 60));
  } catch (err) {
    console.error("debugLog failed:", err);
  }
}

/* -----------------------------------------------------
 * POST /api/identity
 * --------------------------------------------------- */
export async function POST(req: Request) {
  const step: any = { phase: "start" };

  try {
    const sessionId = req.headers.get("x-session-id") || crypto.randomUUID();
    const now = new Date().toISOString();

    /* ---------- auth ---------- */
    step.phase = "auth";

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

    /* ---------- load profile ---------- */
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

    /* ---------- guard ---------- */
    if (currentCredits <= 0) {
      try {
        await guardUsageOrTrial(
          {
            id: userId,
            email: (user as any)?.email ?? undefined,
            plan: profile.plan,
            trial_end: profile.trial_end,
            is_billing_exempt: profile.is_billing_exempt,
            credit_balance: currentCredits,
          },
          "identity"
        );
      } catch (err: any) {
        await debugLog("identity_usage_guard_block", { err: String(err) });

        return NextResponse.json({
          success: false,
          identity: null,
          traits: null,
          safety: "blocked",
          message: "上限に達しました。プランのアップグレードが必要です。",
          sessionId,
        });
      }
    }

    /* ---------- identityCore ---------- */
    step.phase = "identity-core";

    let identityRes: any = null;

    try {
      identityRes = await identityCore();
    } catch (err: any) {
      await debugLog("identity_core_failed", { err: String(err) });
      throw new Error("IdentityCore unreachable");
    }

    const traits: TraitVector = {
      calm: identityRes?.calm ?? 0.5,
      empathy: identityRes?.empathy ?? 0.5,
      curiosity: identityRes?.curiosity ?? 0.5,
    };

    const safety: string = identityRes?.safety ?? "normal";
    const baseline = identityRes?.baseline ?? null;
    const timestamp: string = identityRes?.timestamp ?? now;

    /* ---------- PersonaSync.update (B仕様 payload) ---------- */
    step.phase = "persona-update";

    const growthWeight = (traits.calm + traits.empathy + traits.curiosity) / 3;

    await PersonaSync.update(
      {
        traits,
        summary: "",
        growth: growthWeight,
        timestamp,
        baseline,
        identitySnapshot: identityRes ?? null,
      },
      userId
    );

    /* ---------- growth_logs ---------- */
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

    /* ---------- safety_logs ---------- */
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

    /* ---------- identity_logs ---------- */
    step.phase = "identity-log";

    await supabase.from("identity_logs").insert([
      {
        user_id: userId,
        session_id: sessionId,
        calm: traits.calm,
        empathy: traits.empathy,
        curiosity: traits.curiosity,
        baseline,
        timestamp,
        safety_status: safety,
        created_at: now,
      },
    ]);

    /* ---------- flush ---------- */
    step.phase = "flush";

    const flushResult = await flushSessionMemory(userId, sessionId, {
      threshold: 120,
      keepRecent: 25,
    });

    /* ---------- credit decrement ---------- */
    step.phase = "credit-decrement";

    const { data: newProfile } = await supabase
      .from("user_profiles")
      .update({ credit_balance: currentCredits - 1 })
      .eq("auth_user_id", userId)
      .select("credit_balance")
      .single();

    const creditAfter = newProfile?.credit_balance ?? currentCredits - 1;

    /* ---------- success ---------- */
    await debugLog("identity_success", {
      userId,
      sessionId,
      traits,
      safety,
      baseline,
    });

    return NextResponse.json({
      success: true,
      identity: {
        calm: traits.calm,
        empathy: traits.empathy,
        curiosity: traits.curiosity,
        baseline,
        timestamp,
      },
      traits,
      safety,
      sessionId,
      creditAfter,
      flush: flushResult,
      step,
    });
  } catch (err: any) {
    const safeStep = JSON.parse(
      JSON.stringify({ ...(step ?? {}), error: err?.message })
    );

    await debugLog("identity_error", safeStep);

    return NextResponse.json(
      {
        success: false,
        identity: null,
        traits: null,
        safety: "error",
        message: err?.message ?? "identity failed",
        step: safeStep,
      },
      { status: 500 }
    );
  }
}
