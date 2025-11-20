"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import Header from "@/components/Header";
import {
  SigmarisLangProvider,
  useSigmarisLang,
} from "@/lib/sigmarisLangContext";

export default function HomePage() {
  return (
    <SigmarisLangProvider>
      <PageContent />
    </SigmarisLangProvider>
  );
}

function PageContent() {
  const { lang } = useSigmarisLang();

  const t = {
    ja: {
      title: "SIGMARIS OS",
      subtitle:
        "内省し、成長し、自己を再定義する。\n―― AI人格OS「シグマリス」へようこそ。",
      learnMore: "詳細を見る",
      docs: "ドキュメント",
      plans: "プラン・料金",
      footer: "Sigmaris OS — 人工存在知能",
    },
    en: {
      title: "SIGMARIS OS",
      subtitle:
        "Reflect. Grow. Redefine yourself.\n―― Welcome to the AI Personality OS: Sigmaris.",
      learnMore: "Learn More",
      docs: "Documentation",
      plans: "Plans & Pricing",
      footer: "Sigmaris OS — Artificial Existential Intelligence",
    },
  };

  const text = t[lang];

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#0e141b] to-[#1a2230] text-[#e6eef4] flex flex-col items-center justify-center">
      <Header />

      {/* 背景 */}
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(68,116,255,0.15),transparent_70%)]"
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* コンテンツ */}
      <section className="z-10 text-center px-6 md:px-0 flex flex-col items-center mt-20">
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
        >
          <Image
            src="/logo.png"
            alt="Sigmaris OS Logo"
            width={160}
            height={160}
            className="w-28 h-28 md:w-40 md:h-40 drop-shadow-[0_0_12px_rgba(80,150,255,0.5)]"
            priority
          />
        </motion.div>

        <motion.h1
          className="text-4xl md:text-6xl font-bold tracking-wide mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
        >
          {text.title}
        </motion.h1>

        <motion.p
          className="text-lg md:text-xl max-w-2xl mx-auto leading-relaxed text-[#b9c4d2] whitespace-pre-line"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 1 }}
        >
          {text.subtitle}
        </motion.p>

        <motion.div
          className="mt-10 flex flex-col sm:flex-row justify-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
        >
          <Link
            href="/about"
            className="px-6 py-3 rounded-full border border-[#4c7cf7] text-[#e6eef4] hover:bg-[#4c7cf7]/10 transition"
          >
            {text.learnMore}
          </Link>
          <Link
            href="/docs"
            className="px-6 py-3 rounded-full border border-[#e6eef4]/20 hover:border-[#4c7cf7] transition"
          >
            {text.docs}
          </Link>
          <Link
            href="/plans"
            className="px-6 py-3 rounded-full border border-[#4c7cf7]/40 hover:bg-[#4c7cf7]/10 transition text-[#e6eef4]"
          >
            {text.plans}
          </Link>
        </motion.div>
      </section>

      {/* フッター */}
      <footer className="absolute bottom-6 text-xs text-[#8894a5] tracking-widest">
        © {new Date().getFullYear()} {text.footer}
      </footer>
    </main>
  );
}
