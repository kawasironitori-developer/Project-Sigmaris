import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

export async function POST(req: Request) {
  try {
    const { plan } = await req.json();

    // ✅ Supabase認証を確認
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getSupabaseServer();

    // ✅ Stripe顧客IDの確認／未登録なら作成
    let stripeCustomerId = user?.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email!,
        metadata: { userId: user.id },
      });

      await supabase
        .from("users")
        .update({ stripe_customer_id: customer.id })
        .eq("id", user.id);

      stripeCustomerId = customer.id;
    }

    // ✅ プラン別のStripe Price IDを設定
    const priceMap: Record<string, string> = {
      pro: process.env.STRIPE_PRICE_PRO_ID!,
      enterprise: process.env.STRIPE_PRICE_ENTERPRISE_ID!,
    };

    const selectedPrice = priceMap[plan] ?? priceMap["pro"];

    // ✅ Stripe Checkout セッション作成
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: selectedPrice, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/billing/success`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/billing/cancel`,
    });

    console.log("💳 Checkout session created:", session.id);

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("[/api/billing/checkout] failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
