// /app/api/aei/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";

import { SafetyLayer } from "@/engine/safety/SafetyLayer";
import { PersonaSync } from "@/engine/sync/PersonaSync";

import type { TraitVector } from "@/lib/traits";
import type { SafetyReport } from "@/types/safety";

import { createInitialContext } from "@/engine/state/StateContext";
import { StateMachine } from "@/engine/state/StateMachine";

/* -----------------------------------------------------
 * 危険語フィルタ
 * --------------------------------------------------- */
function guardianFilter(text: string) {
  const banned = /(殺|死|暴力|自殺|危険|犯罪|攻撃)/;
  const flagged = banned.test(text);
  return flagged
    ? {
        safeText:
          "ごめんね、その話題は慎重に扱いたいな。別の方向から考えてみようか？",
        flagged: true,
      }
    : { safeText: text, flagged: false };
}

/* -----------------------------------------------------
 * GET: 履歴取得
 * --------------------------------------------------- */
export async function GET(req: Request) {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) return NextResponse.json({ messages: [] });

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session");
    if (!sessionId) return NextResponse.json({ messages: [] });

    const supabase = getSupabaseServer();

    const { data, error } = await supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("user_id", user.id)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("AEI GET messages error:", error.message);
      return NextResponse.json({ messages: [] }, { status: 500 });
    }

    const paired: { user: string; ai: string }[] = [];
    let pendingUser: string | null = null;

    (data ?? []).forEach((r: any) => {
      if (r.role === "user") {
        pendingUser = r.content;
      } else {
        paired.push({ user: pendingUser ?? "", ai: r.content ?? "" });
        pendingUser = null;
      }
    });

    if (pendingUser !== null) paired.push({ user: pendingUser, ai: "" });

    return NextResponse.json({ messages: paired });
  } catch (e) {
    console.error("AEI GET handler failed:", e);
    return NextResponse.json({ messages: [] }, { status: 500 });
  }
}

/* -----------------------------------------------------
 * POST: Sigmaris OS — StateMachineメインAPI
 * --------------------------------------------------- */
export async function POST(req: Request) {
  const step: any = { phase: "POST-start" };

  try {
    const body = await req.json();
    const { text, recent, summary } = body as {
      text?: string;
      recent?: any;
      summary?: any;
    };

    const userText = text?.trim() || "こんにちは";
    const sessionId = req.headers.get("x-session-id") || crypto.randomUUID();
    step.sessionId = sessionId;
    step.recentCount = Array.isArray(recent) ? recent.length : 0;
    step.hasSummary = !!summary;

    // 認証
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      step.authError = authError?.message;
      return NextResponse.json(
        { error: "Unauthorized", step },
        { status: 401 }
      );
    }

    const supabase = getSupabaseServer();

    /* -------------------------------------------------------
     * クレジットチェック
     * ----------------------------------------------------- */
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("credit_balance")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("AEI credit load error:", profileError.message);
    }

    const currentCredits = profile?.credit_balance ?? 0;
    step.credit = currentCredits;

    if (currentCredits <= 0) {
      const message =
        "💬 クレジットが不足しています。チャージまたはプラン変更を行ってください。";
      const now = new Date().toISOString();

      await supabase.from("messages").insert([
        {
          user_id: user.id,
          session_id: sessionId,
          role: "user",
          content: userText,
          created_at: now,
        },
        {
          user_id: user.id,
          session_id: sessionId,
          role: "ai",
          content: message,
          created_at: now,
        },
      ]);

      return NextResponse.json({ success: false, output: message, sessionId });
    }

    // クレジット減算
    const { error: creditUpdateError } = await supabase
      .from("user_profiles")
      .update({ credit_balance: currentCredits - 1 })
      .eq("id", user.id);

    if (creditUpdateError) {
      console.error("AEI credit update error:", creditUpdateError.message);
    }

    /* -------------------------------------------------------
     * Persona ロード
     * ----------------------------------------------------- */
    const persona = await PersonaSync.load(user.id);
    const traits: TraitVector = {
      calm: persona.calm,
      empathy: persona.empathy,
      curiosity: persona.curiosity,
    };

    /* -------------------------------------------------------
     * Sigmaris OS — StateMachine 実行
     * ----------------------------------------------------- */
    const ctx = createInitialContext();
    ctx.input = userText;
    ctx.traits = SafetyLayer.stabilize(traits);
    ctx.sessionId = sessionId;
    ctx.summary = summary ?? null;
    ctx.recent = recent ?? null;

    // SafetyLayer → SafetyReport 初期化
    const overloadText = SafetyLayer.checkOverload(ctx.traits);

    ctx.safety = overloadText
      ? ({
          flags: {
            selfReference: false,
            abstractionOverload: true,
            loopSuspect: false,
          },
          action: "rewrite-soft",
          note: overloadText,
          suggestMode: "calm-down",
        } as SafetyReport)
      : ({
          flags: {
            selfReference: false,
            abstractionOverload: false,
            loopSuspect: false,
          },
          action: "allow",
          note: "",
          suggestMode: "normal",
        } as SafetyReport);

    const machine = new StateMachine(ctx);
    const finalCtx = await machine.run();

    let aiOutput = finalCtx.output;

    // 危険語フィルタ
    const gf = guardianFilter(aiOutput);
    aiOutput = gf.safeText;

    const updatedTraits = finalCtx.traits;

    // Persona更新
    await PersonaSync.update(
      updatedTraits,
      "",
      (updatedTraits.calm + updatedTraits.empathy + updatedTraits.curiosity) /
        3,
      user.id
    );

    const now = new Date().toISOString();

    await supabase.from("messages").insert([
      {
        user_id: user.id,
        session_id: sessionId,
        role: "user",
        content: userText,
        created_at: now,
      },
      {
        user_id: user.id,
        session_id: sessionId,
        role: "ai",
        content: aiOutput,
        created_at: now,
      },
    ]);

    return NextResponse.json({
      success: true,
      output: aiOutput,
      traits: updatedTraits,
      safety: finalCtx.safety ?? ctx.safety,
      sessionId,
      step,
    });
  } catch (e: any) {
    step.error = e?.message;
    console.error("AEI POST handler failed:", e);
    return NextResponse.json(
      { error: e?.message || "Unknown error", step },
      { status: 500 }
    );
  }
}
