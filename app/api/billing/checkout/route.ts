// /app/api/billing/checkout/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";

let stripe: any = null;
try {
  const Stripe = require("stripe");
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });
  } else {
    console.warn("⚠️ Stripe key not found — mock mode enabled");
  }
} catch (e) {
  console.warn("⚠️ Stripe SDK unavailable:", e);
}

/**
 * 💳 プリペイド式チャージ Checkout API
 * - Stripe Payment モードで単発課金
 * - Webhookで支払い成功後にクレジット残高を加算
 */
export async function POST(req: Request) {
  try {
    const { amount } = await req.json();

    // ✅ Supabase認証
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ✅ Stripe未設定時のモックモード
    if (!stripe) {
      console.log("💤 Mock Stripe Checkout triggered (審査中)");
      return NextResponse.json({
        message:
          "Stripe審査中のため、現在チャージは利用できません。審査通過後に自動有効化されます。",
      });
    }

    const supabase = getSupabaseServer();

    // ✅ Stripe顧客IDの確認／未登録なら作成
    let stripeCustomerId = (user as any)?.stripe_customer_id;

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

    // ✅ チャージ金額に応じた Price ID をマッピング
    const priceMap: Record<string, string> = {
      "1000": process.env.STRIPE_PRICE_1000_ID ?? "",
      "3000": process.env.STRIPE_PRICE_3000_ID ?? "",
    };

    const selectedPrice = priceMap[amount];
    if (!selectedPrice) {
      throw new Error(`Invalid charge amount or missing Stripe Price ID.`);
    }

    // ✅ Checkout セッション生成（プリペイドモード）
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "payment", // 🔥 単発支払いモード
      line_items: [{ price: selectedPrice, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/billing/success`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/billing/cancel`,
      metadata: {
        userId: user.id,
        charge_type: `${amount}yen`,
      },
    });

    console.log(
      `💳 Checkout session created for ${amount}円チャージ`,
      session.id
    );

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("[/api/billing/checkout] failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
