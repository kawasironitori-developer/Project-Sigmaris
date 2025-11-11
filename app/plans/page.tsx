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

  // ✅ ログイン確認
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
        "Sigmaris OSは、人間のように内省・成長するAI人格を体験できるシステムです。対話や内省を通じて“思考構造”を探求します。\n\nすべてのプランは同一機能で、付与されるクレジット数のみが異なります。利用にはログインが必須です。",
      planTitle: "💳 クレジット付与プラン",
      back: "← Homeへ戻る",
      loginPrompt: "ログインしてください。",
    },
    en: {
      title: "Sigmaris OS — Credit Plans",
      aboutTitle: "🧠 About Sigmaris OS",
      aboutText:
        "Sigmaris OS lets you experience an introspective AI personality. All plans provide identical features; only the number of included credits differs. Login is required to charge or use the system.",
      planTitle: "💳 Credit Plans",
      back: "← Back to Home",
      loginPrompt: "Please log in to continue.",
    },
  } as const;

  const text = t[lang];

  // ✅ 全プラン統一（違いはクレジット数のみ）
  const plansList: Plan[] = [
    {
      name: "Free Plan",
      price: "¥0",
      credits: 10,
      desc: "初回ログイン時に10クレジット付与",
      details: [
        "・全機能利用可能",
        "・Reflect / AEI エンジン体験",
        "・登録後、自動で10クレジット付与",
      ],
      button: "無料で開始",
    },
    {
      name: "Basic Plan",
      price: "¥1,000",
      credits: 100,
      desc: "開発・体験向け（100クレジット）",
      details: [
        "・全機能利用可能",
        "・約100クレジット付与",
        "・レスポンス通常（3〜8秒）",
      ],
      button: "チャージ（¥1,000）",
    },
    {
      name: "Advanced Plan",
      price: "¥3,000",
      credits: 400,
      desc: "研究・開発者向け（400クレジット）",
      details: [
        "・全機能利用可能",
        "・約400クレジット付与",
        "・優先処理（2〜5秒）",
      ],
      button: "チャージ（¥3,000）",
    },
  ];

  // ✅ チャージ（ログイン必須）
  const handleCharge = async (amount: string, plan: string) => {
    if (!user) {
      alert(text.loginPrompt);
      router.push("/auth/login");
      return;
    }

    // Freeはサーバー側の /api/claim-free 呼び出し
    if (plan === "Free Plan") {
      const res = await fetch("/api/claim-free", { method: "POST" });
      const data = await res.json();
      alert(data.message);
      return;
    }

    // 有料プランは checkout 経由
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.message || "チャージに失敗しました。");
    } catch {
      alert("通信エラーが発生しました。");
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

        {/* プランカード */}
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
                <p className="text-sm text-[#a8b3c7] mb-3">{p.desc}</p>
                <p className="text-sm text-[#c4d0e2] mb-4">
                  付与クレジット数：{p.credits}
                </p>
                <ul className="text-sm text-left space-y-2 text-[#c4d0e2] mb-6">
                  {p.details.map((d, j) => (
                    <li key={j}>{d}</li>
                  ))}
                </ul>

                <button
                  onClick={() =>
                    handleCharge(
                      p.name === "Basic Plan"
                        ? "1000"
                        : p.name === "Advanced Plan"
                        ? "3000"
                        : "0",
                      p.name
                    )
                  }
                  className="inline-block px-6 py-2 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/10 transition"
                >
                  {p.button}
                </button>
              </div>
            ))}
          </div>
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
