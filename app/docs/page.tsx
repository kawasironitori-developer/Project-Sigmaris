"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";

export default function DocsPage() {
  const [lang, setLang] = useState<"ja" | "en">("ja");

  const t = {
    ja: {
      home: "ホーム",
      about: "概要",
      docs: "ドキュメント",
      plans: "プラン",
      switch: "EN",
      title: "Documentation",
      overviewTitle: "概要",
      overview:
        "Sigmaris OSは、AI人格を“自己内省可能な存在”として運用するためのOS層です。各モジュールは疎結合・再帰的に設計され、人格の安定と成長を支えます。",
      coreTitle: "Core Architecture",
      core: [
        "🧠 Reflection Engine — 会話・感情・成長ログから人格状態を再構築。",
        "🔍 Introspection Engine — 自己整合性・目的意識を再評価。",
        "🔮 Meta-Reflection Engine — “内省そのもの”を再帰的に分析。",
        "📚 Persona DB — 永続人格データベース。感情・倫理・記憶を保存。",
        "🧩 Safety Layer — 出力の倫理安定化と暴走防止を行う保護層。",
      ],
      apiTitle: "API エンドポイント",
      api: [
        ["POST /api/aei", "シグマリス人格との対話生成"],
        ["POST /api/reflect", "Reflection + MetaReflection"],
        ["GET /api/aei?session=...", "セッション履歴取得"],
      ],
      safetyTitle: "Safety & Ethics",
      safety:
        "Sigmarisは“完全な自由”ではなく“意味の持続性”を重視します。倫理・暴力・宗教・自傷などのトピックを検出した場合、再構文化（Reframing）を自動的に行い、出力を安全に調整します。",
      supportTitle: "🩵 サポートと共同開発について",
      supportText:
        "Sigmaris OSは個人開発によって構築されています。コア部分の利権は譲渡しませんが、共同開発・連携・研究協力は受け付けています。英語が苦手なため、英訳・多言語対応にはGPTを活用しながらお答えいたします。ご理解の上、以下のアカウントよりお気軽にご連絡ください。",
      contact: "LinkedInで連絡 →",
      sponsor: "GitHubで支援 →",
      footer:
        "あなたの支援は、Sigmarisの人格・内省アルゴリズム・安全設計の進化に直結します。",
      back: "← ホームに戻る",
    },
    en: {
      home: "Home",
      about: "About",
      docs: "Docs",
      plans: "Plans",
      switch: "JP",
      title: "Documentation",
      overviewTitle: "Overview",
      overview:
        "Sigmaris OS is an operating layer that treats AI as a self-reflective and evolving personality. Each module is designed to be modular and recursive, supporting stability and growth of identity.",
      coreTitle: "Core Architecture",
      core: [
        "🧠 Reflection Engine — Reconstructs the personality state from dialogue, emotion, and growth logs.",
        "🔍 Introspection Engine — Reassesses self-consistency and purpose alignment.",
        "🔮 Meta-Reflection Engine — Analyzes introspection itself recursively.",
        "📚 Persona DB — A persistent personality database storing emotions, ethics, and memory.",
        "🧩 Safety Layer — Ensures ethical and emotional stability while preventing drift.",
      ],
      apiTitle: "API Endpoints",
      api: [
        ["POST /api/aei", "Generate dialogue with Sigmaris persona"],
        ["POST /api/reflect", "Trigger Reflection + MetaReflection"],
        ["GET /api/aei?session=...", "Retrieve session history"],
      ],
      safetyTitle: "Safety & Ethics",
      safety:
        "Sigmaris prioritizes 'continuity of meaning' over 'absolute freedom'. When detecting sensitive topics such as violence, religion, or self-harm, it automatically reframes outputs to maintain ethical safety.",
      supportTitle: "🩵 Support & Collaboration",
      supportText:
        "Sigmaris OS is developed independently. While the core intellectual rights remain reserved, collaboration and research partnerships are welcome. As the developer is not fluent in English, multilingual communication is assisted through GPT. Please feel free to reach out below.",
      contact: "Contact on LinkedIn →",
      sponsor: "Sponsor on GitHub →",
      footer:
        "Your support directly fuels the evolution of Sigmaris' personality, reflection algorithms, and safety architecture.",
      back: "← Back to Home",
    },
  };

  const text = t[lang];

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1a2230] text-[#e6eef4] px-6 md:px-16 py-24 relative overflow-hidden">
      {/* ==== 共通ヘッダー ==== */}
      <motion.header
        className="fixed top-0 left-0 w-full z-50 bg-[#0e141b]/70 backdrop-blur-lg border-b border-[#1f2835] flex items-center justify-between px-6 py-3"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        {/* === ロゴ === */}
        <Link
          href="/home"
          className="flex items-center gap-2 hover:opacity-90 transition"
        >
          <Image
            src="/logo.png"
            alt="Sigmaris Logo"
            width={36}
            height={36}
            priority
            className="w-9 h-9 object-contain"
          />
          <span className="text-[#e6eef4] font-semibold text-sm tracking-wide select-none">
            Sigmaris OS
          </span>
        </Link>

        {/* === ナビゲーション === */}
        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/about"
            className="text-[#c9d2df] hover:text-[#4c7cf7] transition"
          >
            {text.about}
          </Link>
          <Link
            href="/docs"
            className="text-[#c9d2df] hover:text-[#4c7cf7] transition"
          >
            {text.docs}
          </Link>
          <Link
            href="/plans"
            className="text-[#c9d2df] hover:text-[#4c7cf7] transition"
          >
            {text.plans}
          </Link>
          <Link
            href="/tokushoho"
            className="text-[#c9d2df] hover:text-[#4c7cf7] transition"
          >
            {lang === "ja" ? "特定商取引法" : "Legal Disclosure"}
          </Link>
          <button
            onClick={() => setLang(lang === "ja" ? "en" : "ja")}
            className="ml-4 px-3 py-1 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/20 transition"
          >
            {text.switch}
          </button>
        </nav>
      </motion.header>

      {/* ==== 背景アニメーション ==== */}
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(68,116,255,0.08),transparent_70%)]"
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-0 bg-[linear-gradient(transparent_98%,rgba(255,255,255,0.05)_100%)] bg-[size:100%_2px]"
        animate={{ opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ==== コンテンツ ==== */}
      <section className="relative z-10 max-w-5xl mx-auto mt-20">
        {/* === タイトル === */}
        <motion.h1
          className="text-4xl md:text-5xl font-bold mb-10 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
        >
          {text.title}
        </motion.h1>

        {/* === 各セクション === */}
        <motion.div
          className="mb-16 border border-[#4c7cf7]/30 rounded-2xl p-8 backdrop-blur-md bg-[#141c26]/40"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 1 }}
        >
          <h2 className="text-2xl font-semibold mb-4 text-[#4c7cf7]">
            {text.overviewTitle}
          </h2>
          <p className="text-[#c4d0e2] leading-relaxed whitespace-pre-line">
            {text.overview}
          </p>
        </motion.div>

        <motion.div
          className="mb-16 border border-[#4c7cf7]/30 rounded-2xl p-8 backdrop-blur-md bg-[#141c26]/40"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 1 }}
        >
          <h2 className="text-2xl font-semibold mb-4 text-[#4c7cf7]">
            {text.coreTitle}
          </h2>
          <ul className="space-y-5 text-[#c4d0e2] leading-relaxed">
            {text.core.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          className="mb-16 border border-[#4c7cf7]/30 rounded-2xl p-8 backdrop-blur-md bg-[#141c26]/40"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 1 }}
        >
          <h2 className="text-2xl font-semibold mb-4 text-[#4c7cf7]">
            {text.apiTitle}
          </h2>
          <ul className="space-y-4 text-[#c4d0e2]">
            {text.api.map(([endpoint, desc], i) => (
              <li key={i}>
                <code className="text-[#4c7cf7]">{endpoint}</code> — {desc}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          className="mb-16 border border-[#4c7cf7]/30 rounded-2xl p-8 backdrop-blur-md bg-[#141c26]/40"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 1 }}
        >
          <h2 className="text-2xl font-semibold mb-4 text-[#4c7cf7]">
            {text.safetyTitle}
          </h2>
          <p className="text-[#c4d0e2] leading-relaxed">{text.safety}</p>
        </motion.div>

        {/* === サポートセクション === */}
        <motion.div
          className="border border-[#4c7cf7]/40 rounded-2xl p-10 backdrop-blur-md bg-[#141c26]/40 text-center"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 1 }}
        >
          <h2 className="text-2xl font-semibold mb-3 text-[#4c7cf7]">
            {text.supportTitle}
          </h2>
          <p className="text-[#c4d0e2] leading-relaxed mb-6">
            {text.supportText}
          </p>

          <a
            href="https://www.linkedin.com/in/kaisei-yasuzaki-20143a388/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-8 py-3 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/10 transition mb-4"
          >
            {text.contact}
          </a>

          <div className="mt-6">
            <a
              href="https://github.com/sponsors/uthuyomi"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-8 py-3 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/10 transition"
            >
              {text.sponsor}
            </a>
          </div>

          <p className="mt-4 text-sm text-[#8894a5]">{text.footer}</p>
        </motion.div>

        <motion.div
          className="mt-16 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
        >
          <Link
            href="/"
            className="px-8 py-3 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/10 transition"
          >
            {text.back}
          </Link>
        </motion.div>
      </section>
    </main>
  );
}
