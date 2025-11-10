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
 * - customer.subscription.* → サブスク系（今後の拡張用）
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig)
    return NextResponse.json({ error: "No signature" }, { status: 400 });

  const raw = await req.text();

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
      raw,
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
      // 🧾 支払い完了（プリペイド）
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

        // 既存の残高取得
        const { data: userData, error: fetchErr } = await supabase
          .from("users")
          .select("credit_balance")
          .eq("stripe_customer_id", stripeCustomerId)
          .single();

        if (fetchErr) {
          console.error("⚠️ Could not fetch user credit:", fetchErr);
        }

        const currentCredits = userData?.credit_balance ?? 0;
        const newCredits = currentCredits + creditsToAdd;

        // 💰 クレジット反映 + 有効期間更新
        const plus30d = new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString();

        await supabase
          .from("users")
          .update({
            plan: "pro",
            trial_end: plus30d,
            credit_balance: newCredits,
          })
          .eq("stripe_customer_id", stripeCustomerId);

        console.log(`💰 Payment success for ${stripeCustomerId}`, {
          chargeType,
          added: creditsToAdd,
          total: newCredits,
          trial_end: plus30d,
        });
        break;
      }

      // 🆕 サブスク作成・更新（将来用）
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        console.log(`ℹ️ Subscription event: ${event.type}`);
        break;
      }

      default:
        console.log(`ℹ️ Unhandled event: ${event.type}`);
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
