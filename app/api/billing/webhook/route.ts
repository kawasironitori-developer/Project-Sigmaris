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
 * 💰 チャージ完了 Webhook
 * - checkout.session.completed イベントを受信して
 *   Supabase の users テーブルにクレジット残高を加算
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig)
    return NextResponse.json({ error: "No signature" }, { status: 400 });

  const raw = await req.text();

  // Stripeキー未設定ならモック応答
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
      // ✅ 支払い完了
      case "checkout.session.completed": {
        const session = event.data.object;
        const stripeCustomerId = session.customer as string | null;
        const metadata = session.metadata || {};
        const chargeType = metadata.charge_type || "unknown";

        // チャージ額を抽出
        let chargeAmount = 0;
        if (chargeType.includes("1000")) chargeAmount = 100;
        if (chargeType.includes("3000")) chargeAmount = 400;

        if (stripeCustomerId && chargeAmount > 0) {
          // 現在残高を取得
          const { data: userRow } = await supabase
            .from("users")
            .select("credits")
            .eq("stripe_customer_id", stripeCustomerId)
            .single();

          const currentCredits = userRow?.credits ?? 0;
          const newCredits = currentCredits + chargeAmount;

          await supabase
            .from("users")
            .update({
              credits: newCredits,
              plan: "active",
            })
            .eq("stripe_customer_id", stripeCustomerId);

          console.log(
            `💰 ${chargeAmount} クレジット加算 (${stripeCustomerId})`
          );
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
