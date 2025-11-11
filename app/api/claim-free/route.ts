export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";

export async function POST() {
  const supabaseAuth = createRouteHandlerClient({ cookies });
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user)
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );

  const supabase = getSupabaseServer();

  // === 既に user_profiles に登録済みか確認 ===
  const { data: existing, error: profileErr } = await supabase
    .from("user_profiles")
    .select("auth_user_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profileErr) {
    console.error("profile check failed:", profileErr.message);
    return NextResponse.json(
      { success: false, message: "Internal error" },
      { status: 500 }
    );
  }

  if (existing) {
    return NextResponse.json({
      success: false,
      message: "既にアカウント登録済みです（初回特典は1回限り）。",
    });
  }

  // === 初回ログインユーザー：新規作成 + 10クレジット ===
  await supabase.from("user_profiles").insert([
    {
      auth_user_id: user.id,
      credit_balance: 10,
      plan: "free",
      trial_end: "2099-12-31",
      claimed_free_bonus: true,
      is_billing_exempt: false,
    },
  ]);

  return NextResponse.json({
    success: true,
    message: "初回ログイン特典として10クレジットを付与しました！",
  });
}
