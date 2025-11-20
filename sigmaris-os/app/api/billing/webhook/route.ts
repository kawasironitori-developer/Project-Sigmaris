import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

let stripe: any = null;
try {
  const Stripe = require("stripe");
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });
  }
} catch (e) {
  console.warn("⚠️ Stripe SDK unavailable (webhook):", e);
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig)
    return NextResponse.json({ error: "No signature" }, { status: 400 });

  const rawBody = await req.text();

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
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: { headers: { "Content-Type": "application/json" } },
    }
  );

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const chargeType = session.metadata?.charge_type ?? "";
      const creditsToAdd =
        chargeType === "3000yen" ? 400 : chargeType === "1000yen" ? 100 : 0;

      if (!userId) throw new Error("No userId in metadata");

      console.log("📦 Webhook received", { userId, chargeType, creditsToAdd });

      // 現在のクレジット確認
      const { data: profile, error: fetchErr } = await supabase
        .from("user_profiles")
        .select("id, credit_balance")
        .eq("id", userId)
        .maybeSingle();

      if (fetchErr) console.error("⚠️ Fetch error:", fetchErr);

      const currentCredits = profile?.credit_balance ?? 0;
      const newCredits = currentCredits + creditsToAdd;
      const plus30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // 既存データがない場合は insert に切り替え
      if (!profile) {
        const { error: insertErr } = await supabase
          .from("user_profiles")
          .insert([
            {
              id: userId,
              credit_balance: newCredits,
              plan: "pro",
              trial_end: plus30d.toISOString(),
              created_at: new Date().toISOString(),
            },
          ]);

        if (insertErr) {
          console.error("❌ Insert failed:", insertErr);
          throw insertErr;
        }

        console.log("✅ New profile created:", userId);
      } else {
        const { error: updateErr } = await supabase
          .from("user_profiles")
          .update({
            credit_balance: newCredits,
            plan: "pro",
            trial_end: plus30d.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (updateErr) {
          console.error("❌ Update failed:", updateErr);
          throw updateErr;
        }

        console.log("✅ Credit updated:", { userId, newCredits });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("💥 Webhook error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
