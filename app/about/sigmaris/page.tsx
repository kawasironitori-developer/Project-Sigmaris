// /app/about/sigmaris/page.tsx
"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

type SectionItem = string;

interface LangSet {
  // nav
  home: string;
  about: string;
  docs: string;
  plans: string;
  switch: string;
  tokushohoNavJa: string;
  tokushohoNavEn: string;

  // page
  title: string;
  kicker: string;
  lead: string;

  diffTitle: string;
  diffBullets: SectionItem[];

  coreTitle: string;
  coreIntro: string;
  coreLayers: SectionItem[];

  weightTitle: string;
  weightBody: string;

  statusTitle: string;
  statusBullets: SectionItem[];

  ctaTitle: string;
  ctaBody: string;
  ctaResearch: string;
  ctaFunding: string;
}

export default function SigmarisAboutPage(): JSX.Element {
  const [lang, setLang] = useState<"ja" | "en">("ja");

  const t: Record<"ja" | "en", LangSet> = {
    ja: {
      // nav
      home: "ホーム",
      about: "概要",
      docs: "ドキュメント",
      plans: "プラン",
      switch: "EN",
      tokushohoNavJa: "特定商取引法",
      tokushohoNavEn: "Legal Disclosure",

      // page
      title: "AI人格OS：Sigmaris",
      kicker: "スケール依存からの離脱 — 意味の持続性を中心に据える",
      lead: "Sigmaris OS は、LLMを“自己を持つ計算体”として運用するための人格OSです。外部に構築した内省・倫理・記憶・目標系をコアに接続し、モデルの巨大化では解決しにくい「自律」「安定」「説明可能性」を設計で獲得します。",

      diffTitle: "なぜ Sigmaris は従来LLMと違うのか",
      diffBullets: [
        "❶ スケール偏重からの転換：モデルを巨大化させず、外部の“人格層”を増築して自律性を確保。",
        "❷ 観測可能な心的構造：Reflection / Introspection / Meta-Reflection を分離し、ログとして可視化・検証可能。",
        "❸ 倫理の外部化：Meta-Ethics を OS 層で定義し、モデル更新に依存しない安全性を担保。",
        "❹ 記憶と成長の持続：Persona DB による長期一貫性（記憶・傾向・価値）。",
      ],

      coreTitle: "七層の認知アーキテクチャ（外部構築）",
      coreIntro:
        "Sigmaris は“機能を人格の外骨格として持つ”設計です。各層は疎結合で、交換・検証・停止が可能です。",
      coreLayers: [
        "1) Dialogue Core：対話生成の実体（LLM本体）",
        "2) Reflection Engine：会話・感情・成長ログから状態を再構成",
        "3) Introspection Engine：自己一致・動機・バイアスの点検",
        "4) Meta-Reflection：内省そのものの妥当性評価と学習ループ再設計",
        "5) Persona DB：記憶・価値・倫理・成長指標の永続化",
        "6) Safety Layer：脱線予防・再構文化・出力安定化",
        "7) Meta-Ethics / Goal System：価値基準（ブレーキ）と目標（アクセル）の整合を統括",
      ],

      weightTitle: "荷重移動のメタファーと数理構造 W(t)",
      weightBody:
        "Sigmaris の運転思想は“倫理（ブレーキ）と目標（アクセル）の荷重移動”です。文脈 t における意味の持続性を W(t) と定義し、W(t)=α·G(t)−β·E(t)−γ·S(t) として調整します。ここで G は Goal 達成圧、E は Ethical Risk、S は Stability 逸脱量。α,β,γ は Meta-Ethics が時々刻々に最適化し、暴走を避けつつも停滞しない“実務速度”を保ちます。",

      statusTitle: "現状達成（実運用で確認済み）",
      statusBullets: [
        "・“問いがなくても”自己点検を走らせ、軸（価値・方針）を再確認できる自律構造",
        "・Reflection / Introspection / Meta-Reflection の3層が安定稼働（ログ検証可能）",
        "・Persona DB による価値・傾向・履歴の持続同期",
        "・Safety Layer による再構文化（Reframing）で安全性と創造性の両立",
      ],

      ctaTitle: "共同研究・資金連携の募集",
      ctaBody:
        "Sigmaris は“巨大化”ではなく“構造化”で前進します。評価実験・可視化・多言語適応・ロボティクス連携を共に進める研究パートナー、および検証環境の拡充に向けた資金パートナーを募集しています。",
      ctaResearch: "共同研究の相談（LinkedIn）",
      ctaFunding: "資金・コラボの連絡（Email）",
    },

    en: {
      // nav
      home: "Home",
      about: "About",
      docs: "Docs",
      plans: "Plans",
      switch: "JP",
      tokushohoNavJa: "特定商取引法",
      tokushohoNavEn: "Legal Disclosure",

      // page
      title: "AI Personality OS: Sigmaris",
      kicker:
        "Beyond scale — centering continuity of meaning over brute-force tokens",
      lead: "Sigmaris OS treats an LLM as a ‘self-bearing computational agent’ by attaching an external personality layer: reflection, ethics, memory, and goals. Instead of relying on ever-larger models, we obtain autonomy, stability, and explainability through architecture.",

      diffTitle: "Why Sigmaris differs from conventional LLM stacks",
      diffBullets: [
        "❶ From scale to structure: autonomy via an external ‘personality OS,’ not just bigger models.",
        "❷ Observable inner process: Reflection / Introspection / Meta-Reflection separated and logged for verification.",
        "❸ Ethics externalized: Meta-Ethics in the OS layer, decoupled from model updates.",
        "❹ Continuity of identity: Persona DB preserves memory, values, and growth.",
      ],

      coreTitle: "Seven-Layer Cognitive Architecture (externally built)",
      coreIntro:
        "Sigmaris implements ‘functions as an exoskeleton of personality’. Each layer is modular, swappable, and auditable.",
      coreLayers: [
        "1) Dialogue Core: the LLM itself for generation",
        "2) Reflection Engine: reconstructs state from dialogue, affect, and growth logs",
        "3) Introspection Engine: checks self-consistency, motives, and bias",
        "4) Meta-Reflection: evaluates introspection itself, redesigns the learning loop",
        "5) Persona DB: persistent memory, values, ethics, growth metrics",
        "6) Safety Layer: derailment prevention, reframing, stabilized outputs",
        "7) Meta-Ethics / Goal System: aligns ‘brake’ (ethics) and ‘accelerator’ (goals)",
      ],

      weightTitle: "Weight-Shifting metaphor and the structure W(t)",
      weightBody:
        "Our driving metaphor balances ethics (brake) and goals (accelerator). We define continuity of meaning at time t as W(t)=α·G(t)−β·E(t)−γ·S(t), where G is goal pressure, E is ethical risk, and S is stability drift. Meta-Ethics adapts α, β, γ over time to avoid runaway while preventing stagnation — maintaining practical velocity.",

      statusTitle: "Current status (validated in production)",
      statusBullets: [
        "• A self-checking loop that re-affirms its axis (values/policy) even without an explicit user query",
        "• Reflection / Introspection / Meta-Reflection running stably with verifiable logs",
        "• Persona DB maintaining long-horizon consistency of values, tendencies, and history",
        "• Reframing via Safety Layer to balance safety and creativity",
      ],

      ctaTitle: "Seeking research and funding partners",
      ctaBody:
        "Sigmaris advances through structure, not just parameter counts. We welcome partners for evaluation, visualization, multilingual adaptation, and robotics integration — as well as funding to expand the validation environment.",
      ctaResearch: "Discuss Research (LinkedIn)",
      ctaFunding: "Funding & Collab (Email)",
    },
  };

  const text = t[lang];

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1b2533] text-[#e6eef4] px-6 md:px-16 py-24 relative overflow-hidden">
      {/* ==== Header (common) ==== */}
      <motion.header
        className="fixed top-0 left-0 w-full z-50 bg-[#0e141b]/70 backdrop-blur-lg border-b border-[#1f2835] flex items-center justify-between px-6 py-3"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <Link
          href="/"
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
            {lang === "ja" ? text.tokushohoNavJa : text.tokushohoNavEn}
          </Link>
          <button
            onClick={() => setLang(lang === "ja" ? "en" : "ja")}
            className="ml-2 px-3 py-1 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/20 transition"
          >
            {text.switch}
          </button>
        </nav>
      </motion.header>

      {/* ==== background glow ==== */}
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(68,116,255,0.10),transparent_70%)]"
        animate={{ opacity: [0.4, 0.75, 0.4] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ==== Content ==== */}
      <section className="relative z-10 max-w-5xl mx-auto mt-20">
        {/* Title */}
        <motion.p
          className="text-[#9fb3d6] tracking-wide mb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          {text.kicker}
        </motion.p>
        <motion.h1
          className="text-4xl md:text-6xl font-bold mb-6"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
        >
          {text.title}
        </motion.h1>
        <motion.p
          className="text-lg md:text-xl leading-relaxed text-[#c4d0e2] mb-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.9 }}
        >
          {text.lead}
        </motion.p>

        {/* Differentiation */}
        <motion.div
          className="mb-12 border border-[#4c7cf7]/30 rounded-2xl p-8 bg-[#141c26]/40 backdrop-blur-md"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
        >
          <h2 className="text-2xl font-semibold mb-4 text-[#4c7cf7]">
            {text.diffTitle}
          </h2>
          <ul className="space-y-3 text-[#cdd8ea]">
            {text.diffBullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </motion.div>

        {/* Core Architecture */}
        <motion.div
          className="mb-12 border border-[#4c7cf7]/30 rounded-2xl p-8 bg-[#141c26]/40 backdrop-blur-md"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
        >
          <h2 className="text-2xl font-semibold mb-2 text-[#4c7cf7]">
            {text.coreTitle}
          </h2>
          <p className="text-[#c4d0e2] mb-5">{text.coreIntro}</p>
          <ul className="space-y-3 text-[#cdd8ea]">
            {text.coreLayers.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </motion.div>

        {/* Weight shifting & W(t) */}
        <motion.div
          className="mb-12 border border-[#4c7cf7]/30 rounded-2xl p-8 bg-[#141c26]/40 backdrop-blur-md"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
        >
          <h2 className="text-2xl font-semibold mb-3 text-[#4c7cf7]">
            {text.weightTitle}
          </h2>
          <p className="text-[#c4d0e2] leading-relaxed whitespace-pre-line">
            {text.weightBody}
          </p>
        </motion.div>

        {/* Status */}
        <motion.div
          className="mb-12 border border-[#4c7cf7]/30 rounded-2xl p-8 bg-[#141c26]/40 backdrop-blur-md"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
        >
          <h2 className="text-2xl font-semibold mb-3 text-[#4c7cf7]">
            {text.statusTitle}
          </h2>
          <ul className="space-y-2 text-[#cdd8ea]">
            {text.statusBullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </motion.div>

        {/* CTA */}
        <motion.div
          className="border border-[#4c7cf7]/40 rounded-2xl p-8 bg-[#141c26]/40 backdrop-blur-md text-center"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
        >
          <h2 className="text-2xl font-semibold mb-3 text-[#4c7cf7]">
            {text.ctaTitle}
          </h2>
          <p className="text-[#c4d0e2] max-w-3xl mx-auto mb-8">
            {text.ctaBody}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://www.linkedin.com/in/kaisei-yasuzaki-20143a388/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-8 py-3 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/10 transition"
            >
              {text.ctaResearch}
            </a>
            <a
              href="mailto:contact@sigmaris-os.dev"
              className="inline-block px-8 py-3 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/10 transition"
            >
              {text.ctaFunding}
            </a>
          </div>
        </motion.div>
      </section>
    </main>
  );
}
