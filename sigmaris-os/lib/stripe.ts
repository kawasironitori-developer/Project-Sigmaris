// /lib/stripe.ts
"use server";

import Stripe from "stripe";
import { getSupabaseServer } from "@/lib/supabaseServer";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("❌ STRIPE_SECRET_KEY not set in .env");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-10-29.clover",
});

/**
 * 🪙 プラン定義（Stripeのprice_idと連携）
 * - price_XXXXX の部分はStripeダッシュボードのPrice IDに置き換える
 */
export const STRIPE_PLANS = {
  free: {
    id: "free",
    label: "Free Plan",
    priceId: null,
    amount: 0,
    features: ["Trial access", "Limited monthly usage"],
  },
  pro: {
    id: "pro",
    label: "Pro Plan",
    priceId: "price_12345_PRO", // ← Stripeの実price_idを入れる
    amount: 1200,
    features: [
      "Full AEI access",
      "Unlimited reflection logs",
      "Priority queue",
    ],
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    priceId: "price_12345_ENT",
    amount: 8000,
    features: ["Multi-user", "Extended API access", "Private support"],
  },
} as const;

/**
 * 🧾 Checkout セッション作成
 * @param userId Supabaseのuser.id
 * @param email ユーザーのメールアドレス
 * @param planId "pro" | "enterprise"
 */
export async function createCheckoutSession(
  userId: string,
  email: string,
  planId: keyof typeof STRIPE_PLANS
) {
  const plan = STRIPE_PLANS[planId];
  if (!plan || !plan.priceId) throw new Error(`Invalid plan: ${planId}`);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "subscription",
    customer_email: email,
    line_items: [{ price: plan.priceId, quantity: 1 }],
    metadata: { userId, planId },
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard?status=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard?status=cancel`,
  });

  console.log(
    `✅ Created Stripe checkout session for ${email} → ${plan.label}`
  );
  return session.url;
}

/**
 * 🔄 Webhookイベント処理（Stripe→Supabase同期）
 * @param event Stripeイベント
 */
export async function handleStripeWebhook(event: Stripe.Event) {
  const supabase = getSupabaseServer();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userEmail = session.customer_email;
      const planId = session.metadata?.planId ?? "pro";

      if (!userEmail) {
        console.error("⚠️ Missing userEmail in session");
        return;
      }

      const { error } = await supabase
        .from("users")
        .update({
          plan: planId,
          trial_end: null,
        })
        .eq("email", userEmail);

      if (error) console.error("⚠️ DB update error:", error);
      else console.log(`🎉 User upgraded → ${userEmail} to ${planId}`);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;

      // 顧客情報をメールで逆引き
      const customer = await stripe.customers.retrieve(customerId);
      const email = (customer as any)?.email;

      if (email) {
        await supabase
          .from("users")
          .update({ plan: "free" })
          .eq("email", email);
        console.log(`🔻 User downgraded → ${email}`);
      }
      break;
    }

    default:
      console.log(`Unhandled Stripe event: ${event.type}`);
  }
}
