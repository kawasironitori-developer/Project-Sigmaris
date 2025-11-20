// /app/dashboard/billing/page.tsx
"use client";

import { useState } from "react";

const plans = [
  {
    id: "free",
    label: "Free",
    price: "¥0 / 月",
    features: ["AI会話 30回/月", "内省ログ 10件まで", "基本モジュールのみ"],
  },
  {
    id: "pro",
    label: "Pro",
    price: "¥1,200 / 月",
    features: ["AI会話 無制限", "Meta-Reflection 自動同期", "安全フィルタ拡張"],
  },
  {
    id: "enterprise",
    label: "Enterprise",
    price: "¥8,000 / 月",
    features: ["複数アカウント連携", "APIアクセス拡張", "専用サポートライン"],
  },
];

export default function BillingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout(planId: string) {
    try {
      setLoading(planId);
      setError(null);

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Unknown error");
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <h1 className="text-3xl font-bold mb-6">💳 プラン管理</h1>

      {error && (
        <div className="bg-red-600/30 border border-red-500 p-3 mb-4 rounded-lg">
          ⚠️ {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="bg-gray-900 border border-gray-700 rounded-2xl p-6 flex flex-col justify-between hover:border-blue-500 transition-all"
          >
            <div>
              <h2 className="text-xl font-semibold mb-2">{plan.label}</h2>
              <p className="text-gray-400 mb-4">{plan.price}</p>
              <ul className="text-sm space-y-1 mb-6 text-gray-300">
                {plan.features.map((f) => (
                  <li key={f}>・{f}</li>
                ))}
              </ul>
            </div>

            <button
              disabled={loading === plan.id}
              onClick={() => handleCheckout(plan.id)}
              className={`mt-auto w-full py-2 rounded-lg font-semibold transition-all ${
                plan.id === "free"
                  ? "bg-gray-600 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loading === plan.id ? "処理中..." : "このプランに変更"}
            </button>
          </div>
        ))}
      </div>

      <p className="text-center text-sm text-gray-500 mt-10">
        Stripeにより安全に決済が行われます。
      </p>
    </div>
  );
}
