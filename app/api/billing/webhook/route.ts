import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

let stripe: any = null;
try {
  const Stripe = require("stripe");
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-06-20",
  });
} catch (e) {
  console.error("⚠️ Stripe SDK unavailable:", e);
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

  // Service Role で Supabase 接続（RLS 無視）
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
        console.warn("⚠️ userId missing in metadata");
        return NextResponse.json({ ok: false });
      }

      // クレジット数決定
      let creditsToAdd = 0;
      if (chargeType.includes("3000")) creditsToAdd = 400;
      else if (chargeType.includes("1000")) creditsToAdd = 100;

      // 現在のユーザー情報取得
      const { data: existing, error: fetchErr } = await supabase
        .from("user_profiles")
        .select("credit_balance")
        .eq("id", userId)
        .maybeSingle();

      if (fetchErr) console.error("⚠️ Fetch error:", fetchErr);

      const currentCredits = Number(existing?.credit_balance ?? 0);
      const newCredits = currentCredits + creditsToAdd;
      const plus30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // 存在すれば更新、なければ新規挿入
      const { error: upsertErr } = await supabase.from("user_profiles").upsert(
        {
          id: userId,
          email,
          plan: "pro",
          credit_balance: newCredits,
          trial_end: plus30d.toISOString(),
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        { onConflict: "id" } // ← idが一致したら更新
      );

      if (upsertErr) {
        console.error("❌ Upsert failed:", upsertErr);
      } else {
        console.log("✅ Credit successfully updated or inserted:", {
          userId,
          email,
          added: creditsToAdd,
          total: newCredits,
        });
      }
    } else {
      console.log(`ℹ️ Unhandled event: ${event.type}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("💥 Webhook internal error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
