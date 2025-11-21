// /app/api/aei/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import { getSupabaseServer } from "@/lib/supabaseServer";
import { SafetyLayer } from "@/engine/safety/SafetyLayer";
import { PersonaSync } from "@/engine/sync/PersonaSync";

import { createInitialContext } from "@/engine/state/StateContext";
import { StateMachine } from "@/engine/state/StateMachine";
import type { TraitVector } from "@/lib/traits";
import type { SafetyReport } from "@/types/safety";

// Python AEI Core (/sync)
import { requestSync } from "@/lib/sigmaris-api";

/* -----------------------------------------------------
 * 危険語フィルタ
 * --------------------------------------------------- */
function guardianFilter(text: string) {
  const banned = /(殺|死|暴力|自殺|危険|犯罪|攻撃)/;
  return banned.test(text)
    ? {
        safeText:
          "ごめんね、その話題は慎重に扱いたいな。別の方向から考えてみようか？",
        flagged: true,
      }
    : { safeText: text, flagged: false };
}

/* -----------------------------------------------------
 * GET: セッション履歴取得
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
    const { data } = await supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("user_id", user.id)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    const paired: { user: string; ai: string }[] = [];
    let tempUser: string | null = null;

    (data ?? []).forEach((m) => {
      if (m.role === "user") tempUser = m.content;
      else {
        paired.push({ user: tempUser ?? "", ai: m.content ?? "" });
        tempUser = null;
      }
    });

    if (tempUser !== null) paired.push({ user: tempUser, ai: "" });

    return NextResponse.json({ messages: paired });
  } catch {
    return NextResponse.json({ messages: [] }, { status: 500 });
  }
}

/* -----------------------------------------------------
 * POST: StateMachine + Python /sync
 * --------------------------------------------------- */
export async function POST(req: Request) {
  const step: any = { phase: "start" };

  try {
    const body = await req.json();
    const { text, recent, summary } = body;

    const userText = text?.trim() || "こんにちは";
    const sessionId = req.headers.get("x-session-id") || crypto.randomUUID();
    step.sessionId = sessionId;

    /* ------------ 認証 ------------- */
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized", step },
        { status: 401 }
      );
    }

    const supabase = getSupabaseServer();

    /* ------------ クレジット確認 ------------- */
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("credit_balance")
      .eq("id", user.id)
      .single();

    const credits = profile?.credit_balance ?? 0;

    if (credits <= 0) {
      const msg = "💬 クレジットが不足しています。チャージしてください。";
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
          content: msg,
          created_at: now,
        },
      ]);

      return NextResponse.json({ success: false, output: msg, sessionId });
    }

    await supabase
      .from("user_profiles")
      .update({ credit_balance: credits - 1 })
      .eq("id", user.id);

    /* ------------ Persona ロード ------------- */
    const persona = await PersonaSync.load(user.id);
    const traits: TraitVector = {
      calm: persona.calm,
      empathy: persona.empathy,
      curiosity: persona.curiosity,
    };

    /* ------------ StateMachine 実行 ------------- */
    const ctx = createInitialContext();
    ctx.input = userText;
    ctx.sessionId = sessionId;

    // StateContext には summary/recent が無い → meta に格納
    ctx.meta.summary = summary ?? null;
    ctx.meta.recent = recent ?? null;

    ctx.traits = SafetyLayer.stabilize(traits);

    const overload = SafetyLayer.checkOverload(ctx.traits);
    ctx.safety = overload
      ? ({
          flags: {
            selfReference: false,
            abstractionOverload: true,
            loopSuspect: false,
          },
          action: "rewrite-soft",
          note: overload,
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
        } as SafetyReport);

    const finalCtx = await new StateMachine(ctx).run();

    /* ------------ Output 安全化 ------------- */
    let aiOutput = guardianFilter(finalCtx.output).safeText;
    const updatedTraits = finalCtx.traits;

    /* ------------ Python /sync ------------- */
    let python = null;
    try {
      python = await requestSync({
        chat: { user: userText, ai: aiOutput },
        context: {
          traits: updatedTraits,
          safety: finalCtx.safety,
          summary: ctx.meta.summary,
          recent: ctx.meta.recent,
        },
      });
      step.python = "ok";
    } catch {
      step.python = "failed";
    }

    /* ------------ PersonaSync B仕様更新 ------------- */
    const growthWeight =
      (updatedTraits.calm + updatedTraits.empathy + updatedTraits.curiosity) /
      3;

    await PersonaSync.update(
      {
        traits: updatedTraits,
        summary: ctx.meta.summary ?? "",
        growth: growthWeight,
        timestamp: new Date().toISOString(),
        baseline: null,
        identitySnapshot: null,
      },
      user.id
    );

    /* ------------ DB保存 ------------- */
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

    /* ------------ Response ------------- */
    return NextResponse.json({
      success: true,
      output: aiOutput,
      traits: updatedTraits,
      safety: finalCtx.safety,
      model: "Sigmaris-StateMachine-v1",
      sessionId,
      python,
      step,
    });
  } catch (e: any) {
    step.error = e?.message;
    return NextResponse.json(
      { error: e?.message ?? "Unknown error", step },
      { status: 500 }
    );
  }
}
