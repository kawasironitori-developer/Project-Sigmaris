// /app/api/account/info/route.ts
export const dynamic = "force-dynamic"; // ← 静的ビルドを禁止して動的API化

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getUsage } from "@/lib/usage";
import { checkTrialExpired } from "@/lib/usage";
import { getPlanLimit } from "@/lib/plan";

/**
 * 🧠 アカウント情報取得API
 * - Supabase Authでログイン中のユーザー情報を取得
 * - plan / trial_end / 利用状況 / 残り回数を返却
 * - 静的化エラー回避のため dynamic API として強制設定
 */
export async function GET() {
  try {
    // === 認証 ===
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // === Service Role でユーザーデータ取得 ===
    const supabase = getSupabaseServer();

    const { data: userRecord, error: userError } = await supabase
      .from("users")
      .select("plan, trial_end")
      .eq("id", user.id)
      .single();

    if (userError) {
      console.error("⚠️ User fetch error:", userError);
      return NextResponse.json({ error: "User fetch failed" }, { status: 500 });
    }

    const plan = userRecord?.plan ?? "free";
    const trial_end = userRecord?.trial_end ?? null;

    // === 使用状況 ===
    const usage_aei = await getUsage(user.id, "aei");
    const usage_reflect = await getUsage(user.id, "reflect");

    // === 試用期限チェック ===
    const trialExpired = checkTrialExpired(trial_end);

    // === プランごとの上限 ===
    const limit_aei = getPlanLimit(plan, "aei");
    const limit_reflect = getPlanLimit(plan, "reflect");

    // === 残り回数算出 ===
    const remaining_aei = Math.max(limit_aei - usage_aei, 0);
    const remaining_reflect = Math.max(limit_reflect - usage_reflect, 0);

    // === レスポンス ===
    return NextResponse.json(
      {
        plan,
        trial_end,
        trial_expired: trialExpired,
        usage_aei,
        usage_reflect,
        remaining_aei,
        remaining_reflect,
        limits: {
          aei: limit_aei,
          reflect: limit_reflect,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("💥 [/api/account/info] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
