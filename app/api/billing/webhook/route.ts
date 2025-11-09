// /app/api/billing/webhook/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

let stripe: any = null;
try {
  // ⚙️ Stripe SDK の動的ロード（キー未設定でも安全）
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
 * Subscription の課金期末 UNIX を堅牢に取得（型差異対応）
 */
function getSubPeriodEndUnix(sub: any): number | null {
  const v = sub.current_period_end ?? sub.current_period?.end ?? null;
  return typeof v === "number" ? v : null;
}

/**
 * 📦 Stripe Webhook ハンドラー
 * - Stripeキー未設定時はモック応答でビルド通過
 * - 通常は署名検証して Supabase を更新
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig)
    return NextResponse.json({ error: "No signature" }, { status: 400 });

  const raw = await req.text();

  // ✅ Stripeキーが無い or SDK未ロード時 → モック応答で安全化
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
      // 🆕 新規 / 更新（期末やプラン変更）
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const stripeCustomerId = subscription.customer as string;

        const periodEndUnix = getSubPeriodEndUnix(subscription);
        const currentPeriodEndISO = periodEndUnix
          ? new Date(periodEndUnix * 1000).toISOString()
          : null;

        // 💡 Price ID でプラン判定
        const priceId = subscription.items.data[0]?.price?.id;
        const plan =
          priceId === process.env.STRIPE_PRICE_PRO_ID
            ? "pro"
            : priceId === process.env.STRIPE_PRICE_ENTERPRISE_ID
            ? "enterprise"
            : "pro";

        await supabase
          .from("users")
          .update({
            plan,
            trial_end: currentPeriodEndISO,
          })
          .eq("stripe_customer_id", stripeCustomerId);

        console.log(`✅ Subscription updated for ${stripeCustomerId}`, {
          plan,
          currentPeriodEndISO,
        });
        break;
      }

      // 🧹 解約
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
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

      // 💰 初回チェックアウト（支払い完了）
      case "checkout.session.completed": {
        const session = event.data.object;
        const stripeCustomerId = session.customer as string | null;

        if (stripeCustomerId) {
          // 暫定で30日分の有効期限を付与
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
