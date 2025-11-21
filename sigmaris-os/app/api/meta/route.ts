// /app/api/meta/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import { getSupabaseServer } from "@/lib/supabaseServer";
import { PersonaSync } from "@/engine/sync/PersonaSync";

import type { TraitVector } from "@/lib/traits";
import type { MetaReport } from "@/engine/meta/MetaReflectionEngine";

import { meta as metaCore } from "@/lib/sigmaris-api";
import { summarize } from "@/lib/summary";
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
 * POST /api/meta
 * Deep MetaReflection Handler
 * --------------------------------------------------------- */
export async function POST(req: Request) {
  const step: any = { phase: "start" };

  try {
    /* -----------------------------
     * Body
     * --------------------------- */
    const body = (await req.json()) as {
      messages?: any[];
      growthLog?: any[];
      history?: string[];
    };
    const messages = body.messages ?? [];
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
     * Profile
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

    /* -----------------------------
     * Guard (no credit)
     * --------------------------- */
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
          "meta"
        );
      } catch (err: any) {
        const message =
          "💬 無料使用上限に達しました。アップグレードしてください。";

        await debugLog("meta_guard_block", { err: String(err) });

        return NextResponse.json(
          {
            success: false,
            metaSummary: message,
            traits: null,
            safety: "blocked",
            sessionId,
          },
          { status: 200 }
        );
      }
    }

    /* -----------------------------
     * Python Meta Core
     * --------------------------- */
    step.phase = "meta-core";
    let metaResult: any = null;
    try {
      metaResult = await metaCore();
    } catch (err) {
      await debugLog("meta_core_failed", { err: String(err) });
      throw new Error("MetaCore unreachable");
    }

    const metaSummary = metaResult?.meta_summary ?? "";
    const reflection = metaResult?.reflection ?? "";
    const traits: TraitVector | null = metaResult?.traits ?? null;
    const safety = metaResult?.safety ?? "normal";
    const metaReport: MetaReport | null =
      (metaResult?.meta_report as MetaReport) ?? null;

    /* -----------------------------
     * PersonaSync.update (B仕様 payload)
     * --------------------------- */
    step.phase = "persona-update";

    if (traits) {
      const growthWeight =
        (traits.calm + traits.empathy + traits.curiosity) / 3;

      await PersonaSync.update(
        {
          traits,
          summary: metaSummary,
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
     * Safety log
     * --------------------------- */
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
     * flush session
     * --------------------------- */
    const flushResult = await flushSessionMemory(userId, sessionId, {
      threshold: 120,
      keepRecent: 25,
    });

    /* -----------------------------
     * credit decrement
     * --------------------------- */
    const { data: newProfile } = await supabase
      .from("user_profiles")
      .update({ credit_balance: currentCredits - 1 })
      .eq("auth_user_id", userId)
      .select("credit_balance")
      .single();

    const creditAfter = newProfile?.credit_balance ?? currentCredits - 1;

    /* -----------------------------
     * save log
     * --------------------------- */
    await supabase.from("meta_logs").insert([
      {
        user_id: userId,
        session_id: sessionId,
        reflection,
        meta_summary: metaSummary,
        safety_status: safety,
        created_at: now,
      },
    ]);

    await debugLog("meta_success", {
      userId,
      sessionId,
      metaSummaryPreview: metaSummary.slice(0, 60),
    });

    return NextResponse.json({
      success: true,
      metaSummary,
      reflection,
      traits,
      safety,
      metaReport,
      flush: flushResult,
      creditAfter,
      sessionId,
      step,
    });
  } catch (err: any) {
    const safe = JSON.parse(
      JSON.stringify({ ...(step ?? {}), error: err?.message })
    );

    await debugLog("meta_error", safe);

    return NextResponse.json(
      {
        success: false,
        metaSummary: "……深層 MetaReflection が失敗したみたい。",
        error: err?.message,
        step: safe,
      },
      { status: 500 }
    );
  }
}
