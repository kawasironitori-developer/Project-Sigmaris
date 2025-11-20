// /app/billing/cancel/page.tsx
"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Header from "@/components/Header";
import {
  SigmarisLangProvider,
  useSigmarisLang,
} from "@/lib/sigmarisLangContext";

export default function BillingCancelPage() {
  return (
    <SigmarisLangProvider>
      <CancelBody />
    </SigmarisLangProvider>
  );
}

function CancelBody() {
  const { lang } = useSigmarisLang();
  const t = {
    ja: {
      title: "決済がキャンセルされました",
      lead: "処理は行われていません。必要に応じて、再度お試しください。",
      home: "← Homeへ戻る",
      plans: "プランへ",
    },
    en: {
      title: "Checkout Canceled",
      lead: "No charges were made. You can retry the checkout anytime.",
      home: "← Back to Home",
      plans: "View Plans",
    },
  } as const;
  const text = t[lang];

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1a2230] text-[#e6eef4] px-6 md:px-16 py-24 overflow-hidden">
      <Header />
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,95,95,0.08),transparent_70%)]"
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <section className="relative z-10 max-w-3xl mx-auto mt-20">
        <motion.h1
          className="text-4xl md:text-5xl font-bold mb-6 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
        >
          {text.title}
        </motion.h1>
        <motion.div
          className="border border-[#4c7cf7]/30 rounded-2xl p-8 backdrop-blur-md bg-[#141c26]/40"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.9 }}
        >
          <p className="text-[#c4d0e2] leading-relaxed">{text.lead}</p>
        </motion.div>
        <motion.div
          className="mt-10 flex gap-4 justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.8 }}
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
