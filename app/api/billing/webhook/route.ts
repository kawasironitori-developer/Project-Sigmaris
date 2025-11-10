// /app/api/billing/webhook/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig)
    return NextResponse.json({ error: "No signature" }, { status: 400 });

  const rawBody = await req.text();

  if (!stripe) {
    console.log("💤 Mock Stripe Webhook triggered (審査中モード)");
    return NextResponse.json({ ok: true, mock: true });
  }

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("❌ Invalid Stripe signature:", err?.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId ?? null;
        const email = session.customer_details?.email ?? null;
        const chargeType = session.metadata?.charge_type ?? "";

        const creditsToAdd = chargeType.includes("3000")
          ? 400
          : chargeType.includes("1000")
          ? 100
          : 0;

        if (!userId) {
          console.warn("⚠️ Missing userId in session metadata");
          break;
        }

        console.log("📦 Webhook Event Received", {
          userId,
          chargeType,
          creditsToAdd,
        });

        // 🔍 既存ユーザー確認
        const { data: existing, error: fetchErr } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("auth_user_id", userId)
          .maybeSingle();

        if (fetchErr) {
          console.error("⚠️ DB fetch error:", fetchErr);
          break;
        }

        const plus30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        if (!existing) {
          // 🆕 初回課金の場合 → 行を自動作成
          console.log("🪄 No profile found — creating new user_profiles row");

          const { error: insertErr } = await supabase
            .from("user_profiles")
            .insert({
              auth_user_id: userId,
              email,
              plan: "pro",
              credit_balance: creditsToAdd,
              trial_end: plus30d.toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });

          if (insertErr) {
            console.error("❌ Failed to insert new profile:", insertErr);
          } else {
            console.log("✅ New user_profiles row created");
          }
        } else {
          // 🧾 既存行がある場合 → クレジット加算
          const currentCredits = Number(existing.credit_balance ?? 0);
          const newCredits = currentCredits + creditsToAdd;

          const { error: updateErr } = await supabase
            .from("user_profiles")
            .update({
              plan: "pro",
              credit_balance: newCredits,
              trial_end: plus30d.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("auth_user_id", userId);

          if (updateErr) {
            console.error("⚠️ Failed to update user profile:", updateErr);
          } else {
            console.log("✅ Credit balance updated successfully", {
              userId,
              total: newCredits,
            });
          }
        }

        break;
      }

      default:
        console.log(`ℹ️ Unhandled event: ${event.type}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("💥 Webhook internal error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
