// /app/api/billing/checkout/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";

let stripe: any = null;
try {
  const Stripe = require("stripe");
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });
  } else {
    console.warn("⚠️ Stripe key not found — mock mode enabled");
  }
} catch (e) {
  console.warn("⚠️ Stripe SDK unavailable:", e);
}

/**
 * 💳 プリペイド式チャージ Checkout API
 * - Stripe Payment モードで単発課金
 * - Webhookで支払い成功後にクレジット残高を加算
 * - 未ログイン状態での決済画面遷移を完全にブロック
 */
export async function POST(req: Request) {
  try {
    const { amount } = await req.json();

    // ✅ Supabaseクライアント（クッキーからセッションを取得）
    const supabaseAuth = createRouteHandlerClient({ cookies });

    // ✅ ユーザー情報取得
    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser();

    // ✅ セッション確認（別呼び出し）
    const {
      data: { session },
      error: sessionError,
    } = await supabaseAuth.auth.getSession();

    // ✅ 両方確認
    if (userError || sessionError || !user || !session) {
      console.warn("🚫 Checkout blocked: user not authenticated");
      return NextResponse.json(
        { error: "Unauthorized. Please log in first." },
        { status: 401 }
      );
    }

    // ✅ Stripe未設定時のモックモード
    if (!stripe) {
      console.log("💤 Mock Stripe Checkout triggered (審査中)");
      return NextResponse.json({
        message:
          "Stripe審査中のため、現在チャージは利用できません。審査通過後に自動有効化されます。",
      });
    }

    // ✅ Supabase（Service Role経由）
    const supabase = getSupabaseServer();

    // ✅ SupabaseからStripe顧客ID取得
    const { data: profileData, error: fetchErr } = await supabase
      .from("user_profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (fetchErr)
      console.warn("⚠️ Failed to fetch stripe_customer_id:", fetchErr);

    let stripeCustomerId = profileData?.stripe_customer_id ?? null;

    // ✅ Stripe顧客未登録の場合、新規作成して保存
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email!,
        metadata: { userId: user.id },
      });

      const { error: updateErr } = await supabase
        .from("user_profiles")
        .update({ stripe_customer_id: customer.id })
        .eq("id", user.id);

      if (updateErr) {
        console.error("❌ Failed to store stripe_customer_id:", updateErr);
      } else {
        console.log("✅ Stripe customer created:", customer.id);
      }

      stripeCustomerId = customer.id;
    }

    // ✅ チャージ金額に応じた Price ID マッピング
    const priceMap: Record<string, string> = {
      "1000": process.env.STRIPE_PRICE_1000_ID ?? "",
      "3000": process.env.STRIPE_PRICE_3000_ID ?? "",
    };

    const selectedPrice = priceMap[amount];
    if (!selectedPrice) {
      throw new Error(`Invalid charge amount or missing Stripe Price ID.`);
    }

    // ✅ Checkout セッション生成（プリペイドモード）
    const stripeSession = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "payment",
      line_items: [{ price: selectedPrice, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/billing/cancel`,
      metadata: {
        userId: user.id,
        charge_type: `${amount}yen`,
      },
    });

    console.log(`💳 Checkout session created`, {
      userId: user.id,
      stripeCustomerId,
      amount,
      sessionId: stripeSession.id,
    });

    return NextResponse.json({ url: stripeSession.url });
  } catch (err: any) {
    console.error("❌ [/api/billing/checkout] failed:", err);
    return NextResponse.json(
      { error: err.message ?? "Checkout creation failed." },
      { status: 500 }
    );
  }
}
