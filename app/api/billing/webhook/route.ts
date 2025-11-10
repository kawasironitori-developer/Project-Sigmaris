// /app/api/billing/webhook/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

let stripe: any = null;
try {
  const Stripe = require("stripe");
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });
  } else {
    console.warn("⚠️ Stripe key not found — mock mode enabled (webhook)");
  }
} catch (e) {
  console.warn("⚠️ Stripe SDK unavailable (webhook):", e);
}

/**
 * 📦 Stripe Webhook ハンドラー
 * - checkout.session.completed → 支払い完了
 * - customer.subscription.* → サブスク系（将来拡張用）
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig)
    return NextResponse.json({ error: "No signature" }, { status: 400 });

  const rawBody = await req.text();

  if (!stripe) {
    console.log("💤 Mock Stripe Webhook triggered (審査中モード)");
    return NextResponse.json({
      ok: true,
      message: "mock webhook ok (Stripe審査中)",
    });
  }

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("❌ Webhook signature verification failed:", err?.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = getSupabaseServer();

  try {
    switch (event.type) {
      /**
       * 🧾 支払い完了（プリペイド式チャージ）
       * Stripe Checkout の単発決済に対応
       */
      case "checkout.session.completed": {
        const session = event.data.object;
        const stripeCustomerId = session.customer as string | null;
        const chargeType = session.metadata?.charge_type ?? "";
        const creditsToAdd =
          chargeType === "3000yen" ? 400 : chargeType === "1000yen" ? 100 : 0;

        if (!stripeCustomerId) {
          console.warn("⚠️ Missing stripeCustomerId in session");
          break;
        }

        // 💾 既存のクレジット残高を取得
        const { data: profile, error: fetchErr } = await supabase
          .from("user_profiles") // ← 修正箇所
          .select("credit_balance")
          .eq("stripe_customer_id", stripeCustomerId)
          .single();

        if (fetchErr) {
          console.error("⚠️ Could not fetch user credit:", fetchErr);
        }

        const currentCredits = profile?.credit_balance ?? 0;
        const newCredits = currentCredits + creditsToAdd;

        // 📅 有効期間 +30日
        const plus30d = new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString();

        // 💰 クレジット反映＋プラン更新
        const { error: updateErr } = await supabase
          .from("user_profiles") // ← 修正箇所
          .update({
            plan: "pro",
            trial_end: plus30d,
            credit_balance: newCredits,
          })
          .eq("stripe_customer_id", stripeCustomerId);

        if (updateErr) {
          console.error("⚠️ Failed to update user profile:", updateErr);
        } else {
          console.log(`💰 Payment success for ${stripeCustomerId}`, {
            chargeType,
            added: creditsToAdd,
            total: newCredits,
            trial_end: plus30d,
          });
        }

        break;
      }

      /**
       * 🆕 サブスク系イベント（将来対応予定）
       */
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        console.log(`ℹ️ Subscription event received: ${event.type}`);
        break;
      }

      default: {
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("⚠️ Webhook handling error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
