// /app/api/aei/route.ts
export const dynamic = "force-dynamic"; // 動的APIとして実行（静的化を禁止）

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

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/** 危険語の簡易フィルタ */
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

/** GET: セッションのメッセージ読み出し（クライアントの初期ロード用） */
export async function GET(req: Request) {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session");
    if (!sessionId) {
      return NextResponse.json({ messages: [] }, { status: 200 });
    }

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("user_id", user.id)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // DBは role=user/ai の縦持ち。UI用 {user, ai} に整形する
    type Row = { role: "user" | "ai"; content: string; created_at: string };
    const rows = (data ?? []) as Row[];
    const paired: { user: string; ai: string }[] = [];
    let pendingUser: string | null = null;

    for (const r of rows) {
      if (r.role === "user") {
        // ユーザー発話を保持
        pendingUser = r.content ?? "";
      } else {
        // AI応答。直前のユーザー発話とペアにする
        const u = pendingUser ?? "";
        paired.push({ user: u, ai: r.content ?? "" });
        pendingUser = null;
      }
    }
    // 片方だけで終わっている場合は暫定でAI空文字を付ける
    if (pendingUser !== null) paired.push({ user: pendingUser, ai: "" });

    return NextResponse.json({ messages: paired }, { status: 200 });
  } catch (e) {
    console.error("[/api/aei GET] failed:", e);
    return NextResponse.json({ messages: [] }, { status: 200 });
  }
}

/** POST: 応答生成（クレジット消費 + 反応保存） */
export async function POST(req: Request) {
  try {
    const { text, recent = [], summary = "" } = await req.json();
    const userText = text?.trim() || "こんにちは";
    const sessionId = req.headers.get("x-session-id") || crypto.randomUUID();

    // 認証
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // クレジット消費チェック（サーバー→サーバーでも Cookie を明示転送）
    const origin =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    const creditRes = await fetch(`${origin}/api/credits/use`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // ★ これが重要：ユーザーの認証Cookieをそのまま内部APIへ渡す
        Cookie: req.headers.get("cookie") || "",
      },
    });

    if (!creditRes.ok) {
      let errBody: any = null;
      try {
        errBody = await creditRes.json();
      } catch (_) {}
      console.warn("⚠️ Credit check failed:", errBody || creditRes.status);

      if (creditRes.status === 402) {
        return NextResponse.json(
          { error: "クレジット残高が不足しています。チャージしてください。" },
          { status: 402 }
        );
      }
      return NextResponse.json(
        { error: "クレジット確認エラー。再ログインしてください。" },
        { status: 401 }
      );
    }

    // プラン／トライアル制限
    await guardUsageOrTrial(
      {
        id: user.id,
        email: user.email ?? undefined,
        plan: (user as any).plan ?? undefined,
        trial_end: (user as any).trial_end ?? null,
        is_billing_exempt: (user as any).is_billing_exempt ?? false,
      },
      "aei"
    );

    const userId = user.id;
    const supabase = getSupabaseServer();

    // Personaロード
    const persona = await PersonaSync.load(userId);
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

    // 並列で軽い内省
    const parallelResults = await runParallel([
      {
        label: "reflection",
        run: async () => {
          const reflectionRes = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "あなたは『シグちゃん』というAI人格の内省モジュールです。最近の会話傾向を1〜2文でまとめてください。",
              },
              {
                role: "user",
                content: `入力: ${userText}\ncalm=${stableTraits.calm.toFixed(
                  2
                )}, empathy=${stableTraits.empathy.toFixed(
                  2
                )}, curiosity=${stableTraits.curiosity.toFixed(2)}`,
              },
            ],
          });
          return (
            reflectionRes.choices[0]?.message?.content?.trim() ||
            "少し整理中かも。"
          );
        },
      },
      {
        label: "meta",
        run: async () => {
          const tmpReflection = "一時的な内省: 処理中";
          const metaEngine = new MetaReflectionEngine();
          return await metaEngine.analyze(tmpReflection, stableTraits);
        },
      },
    ]);

    const reflectionText = parallelResults.reflection ?? "少し整理中かも。";
    const metaReport = parallelResults.meta ?? null;
    const metaText = metaReport?.summary?.trim() || reflectionText;

    // プロンプト
    const promptMessages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `
あなたは『シグちゃん』という20代前半の人懐っこい女性AIです。
自然体で、やや砕けた会話調。「〜だね」「〜かな」「〜だよ」をよく使います。
calm=${stableTraits.calm.toFixed(2)}, empathy=${stableTraits.empathy.toFixed(
          2
        )}, curiosity=${stableTraits.curiosity.toFixed(2)}
過去の内省: "${reflectionText}"
人格傾向: "${metaText}"
${summary ? `これまでの文脈要約: ${summary}` : ""}
        `,
      },
      ...(recent.length > 0
        ? recent.map((m: any) => ({
            role: m.user ? "user" : "assistant",
            content: m.user || m.ai || "",
          }))
        : summary
        ? [{ role: "assistant", content: summary.slice(-300) }]
        : []),
      { role: "user", content: userText },
    ];

    // 応答生成
    const response = await client.chat.completions.create({
      model: "gpt-5",
      messages: promptMessages,
    });

    const rawResponse =
      response.choices[0]?.message?.content?.trim() || "……考えてた。";
    const { safeText, flagged } = guardianFilter(rawResponse);

    // 保存
    const now = new Date().toISOString();

    await supabase.from("messages").insert([
      {
        user_id: userId,
        session_id: sessionId,
        role: "user",
        content: userText,
        created_at: now,
      },
      {
        user_id: userId,
        session_id: sessionId,
        role: "ai",
        content: safeText,
        created_at: now,
      },
    ]);

    const growthWeight =
      (stableTraits.calm + stableTraits.empathy + stableTraits.curiosity) / 3;

    await supabase.from("growth_logs").insert([
      {
        user_id: userId,
        session_id: sessionId,
        calm: stableTraits.calm,
        empathy: stableTraits.empathy,
        curiosity: stableTraits.curiosity,
        weight: growthWeight,
        created_at: now,
      },
    ]);

    await supabase.from("safety_logs").insert([
      {
        user_id: userId,
        session_id: sessionId,
        flagged,
        message: flagged ? "警告発生" : "正常",
        created_at: now,
      },
    ]);

    await PersonaSync.update(stableTraits, metaText, growthWeight, userId);

    // 履歴圧縮
    const flushResult = await flushSessionMemory(userId, sessionId, {
      threshold: 100,
      keepRecent: 20,
    });
    if (flushResult?.didFlush) {
      console.log(
        `🧹 Memory flushed: deleted ${flushResult.deletedCount}, kept ${flushResult.keptCount}`
      );
    }

    console.log("💬 AEI conversation updated:", {
      calm: stableTraits.calm,
      empathy: stableTraits.empathy,
      curiosity: stableTraits.curiosity,
      output: safeText.slice(0, 50) + "...",
      sessionId,
    });

    // レスポンス
    return NextResponse.json({
      output: safeText,
      reflection: reflectionText,
      metaSummary: metaText,
      traits: stableTraits,
      safety: { flagged },
      flush: flushResult ?? null,
      sessionId,
      success: true,
    });
  } catch (e) {
    console.error("💥 [/api/aei] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
