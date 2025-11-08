import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseServer } from "@/lib/supabaseServer";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
// ↑ apiVersion は明示しない（パッケージ同梱の型とのズレ回避）

/** Subscription の課金期末 UNIX を堅牢に取得（型差異に対応） */
function getSubPeriodEndUnix(sub: Stripe.Subscription): number | null {
  // 旧: current_period_end(number), 新: current_period?.end(number) の両対応
  const v =
    (sub as any).current_period_end ?? (sub as any).current_period?.end ?? null;
  return typeof v === "number" ? v : null;
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig)
    return NextResponse.json({ error: "No signature" }, { status: 400 });

  const raw = await req.text();

  let event: Stripe.Event;
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
      // 新規/更新（期末の更新やプラン変更など）
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = subscription.customer as string;

        const periodEndUnix = getSubPeriodEndUnix(subscription);
        const currentPeriodEndISO = periodEndUnix
          ? new Date(periodEndUnix * 1000).toISOString()
          : null;

        // プラン判定（Price ID で分岐）
        const priceId = subscription.items.data[0]?.price?.id;
        const plan =
          priceId === process.env.STRIPE_PRICE_PRO_ID
            ? "pro"
            : priceId === process.env.STRIPE_PRICE_ENTERPRISE_ID
            ? "enterprise"
            : "pro"; // デフォルトは pro に寄せる

        await supabase
          .from("users")
          .update({
            plan,
            // ここでは「課金サイクルの期末」を trial_end に格納しておく（名称は流用）
            trial_end: currentPeriodEndISO,
          })
          .eq("stripe_customer_id", stripeCustomerId);

        console.log(`✅ Subscription upserted for ${stripeCustomerId}`, {
          plan,
          currentPeriodEndISO,
        });
        break;
      }

      // 解約
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = subscription.customer as string;

        await supabase
          .from("users")
          .update({
            plan: "free",
            trial_end: null,
          })
          .eq("stripe_customer_id", stripeCustomerId);

        console.log(`⚠️ Subscription canceled for ${stripeCustomerId}`);
        break;
      }

      // 初回チェックアウト（支払い完了）
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const stripeCustomerId = session.customer as string | null;

        if (stripeCustomerId) {
          // 初回は 30 日の有効期限を暫定付与（必要なら Price の期間を参照して置換）
          const plus30d = new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          ).toISOString();

          await supabase
            .from("users")
            .update({
              plan: "pro",
              trial_end: plus30d,
            })
            .eq("stripe_customer_id", stripeCustomerId);

          console.log(`💰 Payment success for ${stripeCustomerId}`, {
            trial_end: plus30d,
          });
        }
        break;
      }

      default: {
        console.log(`ℹ️ Unhandled event: ${event.type}`);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Webhook handling error:", err);
    return NextResponse.json(
      { error: err?.message ?? "internal error" },
      { status: 500 }
    );
  }
}
