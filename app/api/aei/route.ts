// /app/api/aei/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { SafetyLayer } from "@/engine/safety/SafetyLayer";
import { MetaReflectionEngine } from "@/engine/meta/MetaReflectionEngine";
import { PersonaSync } from "@/engine/sync/PersonaSync";
import { runParallel } from "@/lib/parallelTasks";
import { flushSessionMemory } from "@/lib/memoryFlush";
import { guardUsageOrTrial } from "@/lib/guard";
import type { TraitVector } from "@/lib/traits";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const DEV = process.env.NODE_ENV !== "production";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/** 🧩 危険語フィルタ */
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

/** 🪶 Supabase Debug Logger */
async function debugLog(phase: string, payload: any) {
  try {
    const supabase = getSupabaseServer();
    await supabase.from("debug_logs").insert([{ phase, payload }]);
  } catch (err) {
    console.error("⚠️ debugLog insert failed", err);
  }
}

/** GET: 履歴取得 */
export async function GET(req: Request) {
  const step: any = { phase: "GET-start" };
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user)
      return NextResponse.json(
        { error: "Unauthorized", step },
        { status: 401 }
      );

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session");
    if (!sessionId) return NextResponse.json({ messages: [], step });

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("user_id", user.id)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    const paired: { user: string; ai: string }[] = [];
    let pendingUser: string | null = null;
    (data ?? []).forEach((r: any) => {
      if (r.role === "user") pendingUser = r.content ?? "";
      else {
        paired.push({ user: pendingUser ?? "", ai: r.content ?? "" });
        pendingUser = null;
      }
    });
    if (pendingUser !== null) paired.push({ user: pendingUser, ai: "" });

    return NextResponse.json({ messages: paired, step });
  } catch (e: any) {
    step.error = e?.message;
    return NextResponse.json({ messages: [], step }, { status: 500 });
  }
}

/** POST: 応答生成 */
export async function POST(req: Request) {
  const step: any = { phase: "POST-start" };
  try {
    const body = await req.json();
    const { text, recent = [], summary = "" } = body;
    const userText = text?.trim() || "こんにちは";
    const sessionId = req.headers.get("x-session-id") || crypto.randomUUID();

    // 認証
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user)
      return NextResponse.json(
        { error: "Unauthorized", step },
        { status: 401 }
      );

    const supabase = getSupabaseServer();

    // 💰 クレジットチェック
    const { data: profile, error: creditErr } = await supabase
      .from("user_profiles")
      .select("credit_balance")
      .eq("id", user.id)
      .single();

    if (creditErr || !profile)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    const currentCredits = profile.credit_balance ?? 0;
    step.credit = currentCredits;

    // ⚠️ 残高不足 → AIメッセージで促す（クレジット減算なし）
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
      console.log("⚠️ クレジット不足応答を送信");
      return NextResponse.json({
        success: false,
        output: message,
        reflection: "",
        metaSummary: "",
        traits: null,
        safety: { flagged: false },
        sessionId,
        step,
      });
    }

    // === 利用制限（トライアルチェック）===
    let trialExpired = false;
    try {
      await guardUsageOrTrial(
        {
          id: user.id,
          email: user.email ?? "",
          plan: (user as any).plan ?? undefined,
          trial_end: (user as any).trial_end ?? null,
          is_billing_exempt: (user as any).is_billing_exempt ?? false,
        },
        "aei"
      );
    } catch (err: any) {
      trialExpired = true;
      console.warn("⚠️ Trial expired — blocking AI response");
      await debugLog("guard-warning", {
        user_id: user.id,
        session_id: sessionId,
        message: err?.message,
      });
    }

    // ⚠️ トライアル終了 → AIメッセージで促す（クレジット減算なし）
    if (trialExpired) {
      const message =
        "💬 トライアル期間が終了しました。プランをアップグレードして再開してください。";
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
      console.log("⚠️ トライアル終了応答を送信");
      return NextResponse.json({
        success: false,
        output: message,
        reflection: "",
        metaSummary: "",
        traits: null,
        safety: { flagged: false },
        sessionId,
        step,
      });
    }

    // 残高・トライアルOK → クレジット減算
    const newCredits = currentCredits - 1;
    await supabase
      .from("user_profiles")
      .update({ credit_balance: newCredits })
      .eq("id", user.id);
    step.creditAfter = newCredits;

    // Personaロード
    const persona = await PersonaSync.load(user.id);
    let traits: TraitVector = {
      calm: persona.calm ?? 0.5,
      empathy: persona.empathy ?? 0.5,
      curiosity: persona.curiosity ?? 0.5,
    };

    // Trait進化
    const lower = userText.toLowerCase();
    if (/(ありがとう|感謝|優しい|嬉しい|助かる)/.test(lower))
      traits.empathy = Math.min(1, traits.empathy + 0.02);
    if (/(怒|ムカ|嫌|最悪|やめ)/.test(lower))
      traits.calm = Math.max(0, traits.calm - 0.03);
    if (/(落ち着|安心|大丈夫)/.test(lower))
      traits.calm = Math.min(1, traits.calm + 0.02);
    if (/(なぜ|どうして|なんで|知りたい|気になる)/.test(lower))
      traits.curiosity = Math.min(1, traits.curiosity + 0.03);
    const stableTraits = SafetyLayer.stabilize(traits);

    // 内省・メタ分析
    const parallel = await runParallel([
      {
        label: "reflection",
        run: async () => {
          const res = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "あなたは『シグちゃん』の内省モジュール。最近の傾向を1〜2文で。",
              },
              {
                role: "user",
                content: `入力:${userText} calm=${stableTraits.calm}, empathy=${stableTraits.empathy}, curiosity=${stableTraits.curiosity}`,
              },
            ],
          });
          return res.choices[0]?.message?.content?.trim() || "少し整理中かも。";
        },
      },
      {
        label: "meta",
        run: async () => {
          const m = new MetaReflectionEngine();
          return await m.analyze("処理中", stableTraits);
        },
      },
    ]);

    const reflection = parallel.reflection ?? "少し整理中かも。";
    const metaText = parallel.meta?.summary?.trim() || reflection;

    // OpenAI応答
    const prompt: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `
あなたは『シグちゃん』という20代前半の女性AIです。
calm=${stableTraits.calm.toFixed(2)}, empathy=${stableTraits.empathy.toFixed(
          2
        )}, curiosity=${stableTraits.curiosity.toFixed(2)}
過去の内省: "${reflection}"
人格傾向: "${metaText}"
${summary ? `これまでの文脈要約: ${summary}` : ""}`,
      },
      ...(recent.length
        ? recent.map((m: any) => ({
            role: m.user ? "user" : "assistant",
            content: m.user || m.ai || "",
          }))
        : []),
      { role: "user", content: userText },
    ];

    const aiRes = await client.chat.completions.create({
      model: "gpt-5",
      messages: prompt,
    });

    const raw =
      aiRes?.choices?.[0]?.message?.content?.trim() ||
      aiRes?.choices?.[0]?.finish_reason ||
      "（応答なし）";
    const { safeText, flagged } = guardianFilter(raw);

    // 保存
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
        content: safeText,
        created_at: now,
      },
    ]);

    await PersonaSync.update(
      stableTraits,
      metaText,
      (stableTraits.calm + stableTraits.empathy + stableTraits.curiosity) / 3,
      user.id
    );

    return NextResponse.json({
      success: true,
      output: safeText,
      reflection,
      metaSummary: metaText,
      traits: stableTraits,
      safety: { flagged },
      sessionId,
      step,
    });
  } catch (e: any) {
    step.error = e?.message;
    await debugLog("error", { step, message: e?.message });
    return NextResponse.json(
      { error: e?.message || String(e), step },
      { status: 500 }
    );
  }
}
