// /app/billing/success/page.tsx
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Header from "@/components/Header";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  SigmarisLangProvider,
  useSigmarisLang,
} from "@/lib/sigmarisLangContext";

export default function BillingSuccessPage() {
  return (
    <SigmarisLangProvider>
      <SuccessBody />
    </SigmarisLangProvider>
  );
}

function SuccessBody() {
  const { lang } = useSigmarisLang();
  const supabase = createClientComponentClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("session_id");
    if (id) setSessionId(id);

    const fetchBalance = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/auth/login";
        return;
      }

      const { data: userData, error } = await supabase
        .from("users")
        .select("credit_balance")
        .eq("id", user.id)
        .single();

      if (!error && userData) {
        setBalance(userData.credit_balance ?? 0);
      }
      setLoading(false);
    };

    fetchBalance();
  }, [supabase]);

  const t = {
    ja: {
      title: "決済が完了しました",
      lead: "ご支援ありがとうございます。決済は正常に受け付けられました。Webhookを通じて残高へ自動反映されます。",
      tip: "反映が見えない場合は、数十秒後にページを再読み込みしてください。",
      balance: "現在のクレジット残高",
      sess: "セッションID",
      home: "← Homeへ戻る",
      plans: "プランへ",
    },
    en: {
      title: "Payment Completed",
      lead: "Thank you for your support. Your payment was successful and will be reflected in your balance via webhook.",
      tip: "If the balance does not update immediately, please refresh the page after a short while.",
      balance: "Current Credit Balance",
      sess: "Session ID",
      home: "← Back to Home",
      plans: "View Plans",
    },
  } as const;

  const text = t[lang];

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1a2230] text-[#e6eef4] px-6 md:px-16 py-24 overflow-hidden">
      <Header />

      {/* 背景アニメーション */}
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_60%_20%,rgba(68,116,255,0.08),transparent_70%)]"
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <section className="relative z-10 max-w-3xl mx-auto mt-20">
        {/* タイトル */}
        <motion.h1
          className="text-4xl md:text-5xl font-bold mb-6 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
        >
          {text.title}
        </motion.h1>

        {/* 説明カード */}
        <motion.div
          className="border border-[#4c7cf7]/30 rounded-2xl p-8 backdrop-blur-md bg-[#141c26]/40"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.9 }}
        >
          <p className="text-[#c4d0e2] leading-relaxed mb-3">{text.lead}</p>
          <p className="text-sm text-[#a8b3c7] mb-4">{text.tip}</p>
          {sessionId && (
            <p className="text-xs text-[#8894a5]">
              {text.sess}: <span className="font-mono">{sessionId}</span>
            </p>
          )}
        </motion.div>

        {/* 残高表示 */}
        <motion.div
          className="mt-10 border border-[#4c7cf7]/40 rounded-2xl p-8 backdrop-blur-md bg-[#1b2331]/50 text-center"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.9 }}
        >
          {loading ? (
            <p className="text-[#a8b3c7]">読み込み中...</p>
          ) : (
            <>
              <h2 className="text-xl font-semibold mb-3 text-[#4c7cf7]">
                {text.balance}
              </h2>
              <p className="text-3xl font-bold">
                {balance !== null ? `${balance} クレジット` : "—"}
              </p>
            </>
          )}
        </motion.div>

        {/* ナビゲーション */}
        <motion.div
          className="mt-10 flex gap-4 justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.9 }}
        >
          <Link
            href="/home"
            className="px-6 py-2 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/10 transition"
          >
            {text.home}
          </Link>
          <Link
            href="/plans"
            className="px-6 py-2 border border-[#4c7cf7]/40 rounded-full hover:bg-[#4c7cf7]/10 transition"
          >
            {text.plans}
          </Link>
        </motion.div>
      </section>
    </main>
  );
}
