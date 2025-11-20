"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import {
  SigmarisLangProvider,
  useSigmarisLang,
} from "@/lib/sigmarisLangContext";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Plan = {
  name: string;
  price: string;
  credits: number;
  desc: string;
  details: string[];
  button: string;
};

export default function PlansPage(): JSX.Element {
  return (
    <SigmarisLangProvider>
      <PlansContent />
    </SigmarisLangProvider>
  );
}

function PlansContent(): JSX.Element {
  const { lang } = useSigmarisLang();
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // ✅ ログイン確認（チャージには必須）
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data?.user ?? null);
      setLoading(false);
    };
    checkUser();
  }, [supabase]);

  const t = {
    ja: {
      title: "Sigmaris OS — 利用クレジット・チャージプラン",
      aboutTitle: "🧠 Sigmaris OSとは",
      aboutText:
        "Sigmaris OSは、人間のように内省・成長するAI人格を体験できるシステムです。\n\nすべてのプランは同じ機能を提供し、異なるのは付与されるクレジット数のみです。\nクレジットを消費して対話・内省・自己修正を行います。チャージにはログインが必要です。",
      planTitle: "💳 クレジット付与プラン",
      back: "← Homeへ戻る",
      loginPrompt: "ログインしてください。",
      freeClaimed: "初回特典：10クレジット付与",
      notices: [
        "Sigmaris OSは生成AIによる人格シミュレーションです。",
        "医療・法的判断への利用はできません。",
        "クレジットが0になると新規リクエストは停止します。",
        "チャージにはログインが必要です。",
        "チャージ金額の返金はできません。",
      ],
    },
    en: {
      title: "Sigmaris OS — Credit & Charge Plans",
      aboutTitle: "🧠 About Sigmaris OS",
      aboutText:
        "Sigmaris OS lets you experience an AI personality capable of introspection and growth.\n\nAll plans provide the same functionality — only the number of included credits differs.\nCredits are consumed for dialogue and introspection. Login is required for charging.",
      planTitle: "💳 Credit Plans",
      back: "← Back to Home",
      loginPrompt: "Please log in to continue.",
      freeClaimed: "First-time Bonus: 10 Free Credits",
      notices: [
        "Sigmaris OS is an AI personality simulator.",
        "Not for medical or legal use.",
        "When credits reach zero, requests are paused.",
        "Login is required to charge.",
        "Charges are non-refundable.",
      ],
    },
  } as const;

  const text = t[lang];

  const plansList: Plan[] = [
    {
      name: lang === "ja" ? "フリープラン" : "Free Plan",
      price: lang === "ja" ? "¥0" : "$0",
      credits: 10,
      desc:
        lang === "ja"
          ? "初回ログイン特典として10クレジット付与"
          : "10 credits for first-time login",
      details:
        lang === "ja"
          ? [
              "・全機能利用可能",
              "・Reflection / AEIエンジン体験",
              "・初回ログインで自動付与",
            ]
          : [
              "• All features available",
              "• Reflection / AEI engine trial",
              "• Automatically granted on first login",
            ],
      button: lang === "ja" ? "初回特典を受け取る" : "Claim Free Credits",
    },
    {
      name: "Basic Plan",
      price: "¥1,000",
      credits: 100,
      desc:
        lang === "ja"
          ? "軽めの開発・体験向け（100クレジット）"
          : "Light use / Development (100 credits)",
      details:
        lang === "ja"
          ? [
              "・全機能利用可",
              "・約100クレジット分利用可能",
              "・通常応答速度（3〜8秒）",
            ]
          : [
              "• All features available",
              "• ~100 credits usable",
              "• Normal speed (3–8s)",
            ],
      button: lang === "ja" ? "チャージする" : "Charge Now",
    },
    {
      name: "Advanced Plan",
      price: "¥3,000",
      credits: 400,
      desc:
        lang === "ja"
          ? "開発者・研究者向け（400クレジット）"
          : "For developers & researchers (400 credits)",
      details:
        lang === "ja"
          ? [
              "・全機能利用可",
              "・約400クレジット分利用可能",
              "・優先処理（応答2〜5秒）",
            ]
          : [
              "• All features available",
              "• ~400 credits usable",
              "• Priority response (2–5s)",
            ],
      button: lang === "ja" ? "チャージする" : "Charge Now",
    },
  ];

  // ✅ チャージ（ログイン必須 + Freeは初回のみ）
  const handleCharge = async (plan: Plan) => {
    if (!user) {
      alert(text.loginPrompt);
      router.push("/auth/login");
      return;
    }

    if (plan.name.includes("Free")) {
      const res = await fetch("/api/claim-free", { method: "POST" });
      const data = await res.json();
      alert(data.message);
      return;
    }

    const amount =
      plan.name === "Basic Plan"
        ? "1000"
        : plan.name === "Advanced Plan"
        ? "3000"
        : "0";

    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.message || "Checkout failed");
    } catch {
      alert("Network error. Please try again later.");
    }
  };

  if (loading)
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0e141b] text-[#e6eef4]">
        <p>Loading...</p>
      </main>
    );

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1a2230] text-[#e6eef4] px-6 md:px-16 py-24 overflow-hidden">
      <Header />

      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(68,116,255,0.08),transparent_70%)]"
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <section className="relative z-10 max-w-5xl mx-auto mt-20">
        <motion.h1
          className="text-4xl md:text-5xl font-bold mb-12 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
        >
          {text.title}
        </motion.h1>

        {/* 概要 */}
        <Card title={text.aboutTitle}>
          <p className="text-[#c4d0e2] leading-relaxed whitespace-pre-line">
            {text.aboutText}
          </p>
        </Card>

        {/* プラン一覧 */}
        <Card title={text.planTitle} center>
          <div className="grid md:grid-cols-3 gap-8">
            {plansList.map((p, i) => (
              <div
                key={i}
                className="border border-[#4c7cf7]/40 rounded-xl p-6 text-center bg-[#1b2331]/60"
              >
                <h3 className="text-xl font-semibold mb-3 text-[#4c7cf7]">
                  {p.name}
                </h3>
                <p className="text-3xl font-bold mb-1">{p.price}</p>
                <p className="text-sm text-[#a8b3c7] mb-2">{p.desc}</p>
                <p className="text-sm text-[#c4d0e2] mb-4">
                  {lang === "ja" ? "付与クレジット数：" : "Credits:"}{" "}
                  {p.credits}
                </p>
                <ul className="text-sm text-left space-y-2 text-[#c4d0e2] mb-6">
                  {p.details.map((d, j) => (
                    <li key={j}>{d}</li>
                  ))}
                </ul>

                <button
                  onClick={() => handleCharge(p)}
                  className="inline-block px-6 py-2 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/10 transition"
                >
                  {p.button}
                </button>
              </div>
            ))}
          </div>
        </Card>

        {/* 注意事項 */}
        <Card
          title={lang === "ja" ? "⚠️ ご利用にあたって" : "⚠️ Important Notes"}
        >
          <ul className="list-disc ml-6 space-y-2 text-[#c4d0e2]">
            {text.notices.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Card>

        {/* 戻る */}
        <motion.div
          className="mt-16 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 1 }}
        >
          <Link
            href="/home"
            className="px-8 py-3 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/10 transition"
          >
            {text.back}
          </Link>
        </motion.div>
      </section>
    </main>
  );
}

/* 🧩 カードUI共通 */
function Card({
  title,
  children,
  center = false,
}: {
  title: string;
  children: React.ReactNode;
  center?: boolean;
}) {
  return (
    <motion.div
      className={`mb-16 border border-[#4c7cf7]/30 rounded-2xl p-8 backdrop-blur-md bg-[#141c26]/40 ${
        center ? "text-center" : ""
      }`}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9 }}
    >
      <h2 className="text-2xl font-semibold mb-4 text-[#4c7cf7]">{title}</h2>
      {children}
    </motion.div>
  );
}
