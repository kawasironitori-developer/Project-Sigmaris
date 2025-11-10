import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { getSupabaseServer } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/auth/login", request.url));

  const cookieStore = (await cookies()) as unknown as ReadonlyRequestCookies;

  const supabase = createRouteHandlerClient({
    cookies: () => cookieStore,
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    console.error("Exchange error:", error);
    return NextResponse.redirect(
      new URL("/auth/login?error=exchange_failed", request.url)
    );
  }

  const user = data.session.user;
  const email = user.email;

  // ✅ Stripe連携を行うための下準備
  // usersテーブルにStripe顧客IDを自動生成 or 既存を確認
  try {
    const db = getSupabaseServer();
    const { data: existing } = await db
      .from("users")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (!existing?.stripe_customer_id) {
      const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
      const customer = await stripe.customers.create({
        email,
        metadata: { userId: user.id },
      });
      await db
        .from("users")
        .update({
          stripe_customer_id: customer.id,
          plan: "free",
          trial_end: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
          ).toISOString(), // 7日トライアル
        })
        .eq("id", user.id);
      console.log("✅ Stripe customer created:", customer.id);
    }
  } catch (e) {
    console.error("Stripe auto-link error:", e);
  }

  // ✅ 認証完了 → ダッシュボードへ
  return NextResponse.redirect(new URL("/", request.url));
}
