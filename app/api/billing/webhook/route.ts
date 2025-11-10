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

/**
 * 📦 Stripe Webhook ハンドラー（UUID対応版）
 * - checkout.session.completed → 支払い完了
 * - metadata.userId = Supabase Auth の UUID
 * - user_profiles.auth_user_id をキーに更新
 * - credit_balance 加算・plan 更新・trial_end 延長
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig)
    return NextResponse.json({ error: "No signature" }, { status: 400 });

  // Stripe が送る生データを取得（必須）
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

  // ✅ Supabase（Service Role Keyで接続）
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId ?? null; // ← Supabase Auth UUID
        const chargeType = (session.metadata?.charge_type ?? "")
          .toLowerCase()
          .trim();

        // ✅ 金額に応じて加算クレジットを算出
        let creditsToAdd = 0;
        if (chargeType.includes("3000")) creditsToAdd = 400;
        else if (chargeType.includes("1000")) creditsToAdd = 100;

        if (!userId) {
          console.warn("⚠️ Missing userId in session metadata");
          break;
        }

        console.log("📦 Webhook Event Received", {
          userId,
          chargeType,
          creditsToAdd,
        });

        // 🔍 現在のクレジットを取得（auth_user_idで検索）
        const { data: profile, error: fetchErr } = await supabase
          .from("user_profiles")
          .select("auth_user_id, credit_balance")
          .eq("auth_user_id", userId)
          .maybeSingle();

        if (fetchErr) {
          console.error("⚠️ Failed to fetch user profile:", fetchErr);
          break;
        }

        const currentCredits = Number(profile?.credit_balance ?? 0);
        const newCredits = currentCredits + Number(creditsToAdd ?? 0);

        // 🧠 デバッグ出力
        console.log("⚙️ Credit update calculation", {
          userId,
          chargeType,
          creditsToAdd,
          currentCredits,
          newCredits,
        });

        // 📅 有効期限を +30日延長
        const plus30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        // 💰 クレジット・プラン情報更新
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
            added: creditsToAdd,
            total: newCredits,
          });
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
