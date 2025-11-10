"use client";

import React from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Header from "@/components/Header";
import {
  SigmarisLangProvider,
  useSigmarisLang,
} from "@/lib/sigmarisLangContext";

type Plan = {
  name: string;
  price: string;
  desc: string;
  details: string[];
  button: string;
  link: string;
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

  const t = {
    ja: {
      title: "Sigmaris OS — 利用クレジットとチャージ案内",
      aboutTitle: "🧠 Sigmaris OSとは",
      aboutText:
        "Sigmaris OSは、人間のように内省・成長するAI人格を体験できるシステムです。対話・内省・自己修正を通じて“思考の構造”を理解することを目的としています。\n\n現在は「チャージ式（プリペイド制）」で運用しており、チャージした分の利用クレジットを消費して対話・内省を行う仕組みになっています。",
      planTitle: "💳 チャージプラン",
      plansList: [
        {
          name: "Free Trial",
          price: "¥0",
          desc: "登録だけで体験可（10回分）",
          details: [
            "・基本対話（/api/aei）利用可",
            "・内省エンジン（Reflection）体験",
            "・10回分の無料クレジット付与",
          ],
          button: "今すぐログイン",
          link: "/auth/login",
        },
        {
          name: "Basic",
          price: "¥1,000 /チャージ",
          desc: "軽めの開発・体験向け",
          details: [
            "・AEI / Reflection 全機能",
            "・約100クレジット分利用可能",
            "・成長ログ・内省履歴保存",
            "・応答速度：通常（3〜8秒）",
          ],
          button: "チャージする",
          link: "basic", // ← ダミー
        },
        {
          name: "Advanced",
          price: "¥3,000 /チャージ",
          desc: "研究・開発者向け",
          details: [
            "・全機能＋高出力モデル対応",
            "・約400クレジット分利用可能",
            "・API連携・高負荷試験対応",
            "・応答速度：約2〜5秒（優先処理）",
          ],
          button: "開発連携を相談",
          link: "https://www.linkedin.com/in/kaisei-yasuzaki-20143a388/",
        },
      ] as Plan[],
      noticeTitle: "⚠️ ご利用にあたっての注意",
      notices: [
        "Sigmaris OSは生成AIによる人格シミュレーションであり、医療・法的判断などへの利用はできません。",
        "応答時間はネットワーク・サーバ負荷により変動します。",
        "クレジット残高が0になると、新規リクエストは自動停止します。",
        "チャージ金額に有効期限はありません（システム維持に伴い仕様変更の可能性あり）。",
        "チャージは返金不可です。利用目的を確認の上ご購入ください。",
        "試用期間中も高負荷利用・自動リクエストは禁止されています。",
      ],
      back: "← Homeへ戻る",
    },
    en: {
      title: "Sigmaris OS — Usage Credits & Charge Plans",
      aboutTitle: "🧠 What is Sigmaris OS?",
      aboutText:
        "Sigmaris OS is a system that allows you to experience an AI personality capable of introspection and growth. It aims to explore the 'structure of thought' through dialogue, reflection, and self-correction.\n\nCurrently, it operates on a prepaid credit system, where each charged credit can be used for dialogue and introspection sessions.",
      planTitle: "💳 Charge Plans",
      plansList: [
        {
          name: "Free Trial",
          price: "$0",
          desc: "Experience with 10 free sessions",
          details: [
            "• Access to basic dialogue (/api/aei)",
            "• Try Reflection Engine",
            "• Includes 10 free credits",
          ],
          button: "Login Now",
          link: "/auth/login",
        },
        {
          name: "Basic",
          price: "¥1,000 /charge",
          desc: "For light development & testing",
          details: [
            "• Full AEI / Reflection access",
            "• Approx. 100 credits available",
            "• Growth & introspection logs saved",
            "• Response speed: 3–8 sec",
          ],
          button: "Charge Now",
          link: "basic",
        },
        {
          name: "Advanced",
          price: "¥3,000 /charge",
          desc: "For researchers & developers",
          details: [
            "• All features + high-output model",
            "• Approx. 400 credits available",
            "• API integration & stress test ready",
            "• Response speed: 2–5 sec (priority)",
          ],
          button: "Contact for Collaboration",
          link: "https://www.linkedin.com/in/kaisei-yasuzaki-20143a388/",
        },
      ] as Plan[],
      noticeTitle: "⚠️ Notes & Disclaimers",
      notices: [
        "Sigmaris OS is a generative AI simulation and not suitable for medical or legal decision-making.",
        "Response time may vary depending on network or server load.",
        "When your credits reach zero, new requests are automatically paused.",
        "Charged credits have no expiration date (subject to change).",
        "All purchases are non-refundable. Please confirm before charging.",
        "High-frequency or automated requests are prohibited, even during trial.",
      ],
      back: "← Back to Home",
    },
  } as const;

  const text = t[lang];

  // 🔹 Stripe Checkout へ遷移する関数
  const handleCheckout = async (plan: string) => {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error || data.message || "Checkout failed");
    }
  };

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

        <Card delay={0.2} title={text.aboutTitle}>
          <p className="text-[#c4d0e2] leading-relaxed whitespace-pre-line">
            {text.aboutText}
          </p>
        </Card>

        <Card delay={0.4} title={text.planTitle} center>
          <div className="grid md:grid-cols-3 gap-8">
            {text.plansList.map((p, i) => {
              const isFeatured = i === 1;
              const isExternal = p.link.startsWith("http");
              const isBasic = p.name === "Basic";

              return (
                <div
                  key={i}
                  className={`border border-[#4c7cf7]/40 rounded-xl p-6 text-center ${
                    isFeatured
                      ? "bg-[#212b3d]/80 shadow-lg shadow-[#4c7cf7]/10"
                      : "bg-[#1b2331]/60"
                  }`}
                >
                  <h3
                    className={`text-xl font-semibold mb-3 ${
                      isFeatured ? "text-[#4c7cf7]" : ""
                    }`}
                  >
                    {p.name}
                  </h3>
                  <p className="text-3xl font-bold mb-2">{p.price}</p>
                  <p className="text-sm text-[#a8b3c7] mb-4">{p.desc}</p>
                  <ul className="text-sm text-left space-y-2 text-[#c4d0e2] mb-6">
                    {p.details.map((d, j) => (
                      <li key={j}>{d}</li>
                    ))}
                  </ul>

                  {isBasic ? (
                    <button
                      onClick={() => handleCheckout("pro")}
                      className="inline-block px-6 py-2 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/10 transition"
                    >
                      {p.button}
                    </button>
                  ) : isExternal ? (
                    <a
                      href={p.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block px-6 py-2 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/10 transition"
                    >
                      {p.button}
                    </a>
                  ) : (
                    <Link
                      href={p.link}
                      className="inline-block px-6 py-2 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/10 transition"
                    >
                      {p.button}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <Card delay={0.6} title={text.noticeTitle}>
          <ul className="list-disc ml-6 space-y-2 text-[#c4d0e2]">
            {text.notices.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Card>

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

/* 小物：カードラッパー */
function Card({
  title,
  children,
  delay = 0,
  center = false,
}: {
  title: string;
  children: React.ReactNode;
  delay?: number;
  center?: boolean;
}) {
  return (
    <motion.div
      className={`mb-16 border border-[#4c7cf7]/30 rounded-2xl p-8 backdrop-blur-md bg-[#141c26]/40 ${
        center ? "text-center" : ""
      }`}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.9 }}
    >
      <h2 className="text-2xl font-semibold mb-4 text-[#4c7cf7]">{title}</h2>
      {children}
    </motion.div>
  );
}
