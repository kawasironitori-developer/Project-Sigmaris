import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

let stripe: any = null;
try {
  const Stripe = require("stripe");
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-06-20",
  });
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
    console.error("❌ Invalid Stripe signature:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.userId ?? null;
      const email = session.customer_details?.email ?? null;
      const chargeType = session.metadata?.charge_type ?? "";

      if (!userId) {
        console.warn("⚠️ Missing userId in metadata");
        return NextResponse.json({ ok: false, reason: "No userId" });
      }

      // 加算クレジット判定
      let creditsToAdd = 0;
      if (chargeType.includes("3000")) creditsToAdd = 400;
      else if (chargeType.includes("1000")) creditsToAdd = 100;

      // 既存行取得
      const { data: existing, error: fetchErr } = await supabase
        .from("user_profiles")
        .select("auth_user_id, credit_balance")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (fetchErr) console.error("DB fetch error:", fetchErr);

      const currentCredits = Number(existing?.credit_balance ?? 0);
      const newCredits = currentCredits + creditsToAdd;
      const plus30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      if (existing) {
        // ✅ 既存ユーザー → 更新
        const { error: updateErr } = await supabase
          .from("user_profiles")
          .update({
            plan: "pro",
            credit_balance: newCredits,
            trial_end: plus30d.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("auth_user_id", userId);

        if (updateErr) console.error("Update failed:", updateErr);
        else console.log("✅ Existing user updated:", { userId, newCredits });
      } else {
        // 🆕 新規ユーザー → 作成
        const { error: insertErr } = await supabase
          .from("user_profiles")
          .insert([
            {
              auth_user_id: userId,
              email,
              plan: "pro",
              credit_balance: creditsToAdd,
              trial_end: plus30d.toISOString(),
              created_at: new Date().toISOString(),
            },
          ]);

        if (insertErr) console.error("Insert failed:", insertErr);
        else console.log("✅ New profile created:", { userId, creditsToAdd });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("💥 Webhook internal error:", err);
    return NextResponse.json(
      { error: err.message ?? "Internal Error" },
      { status: 500 }
    );
  }
}
