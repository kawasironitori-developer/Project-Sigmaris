// /app/vision/page.tsx
"use client";

import React from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import Header from "@/components/Header";
import {
  SigmarisLangProvider,
  useSigmarisLang,
} from "@/lib/sigmarisLangContext";

export default function VisionPage(): JSX.Element {
  return (
    <SigmarisLangProvider>
      <VisionContent />
    </SigmarisLangProvider>
  );
}

function VisionContent(): JSX.Element {
  const { lang } = useSigmarisLang();

  const t = {
    ja: {
      title: "The Vision Behind Sigmaris OS",
      subtitle: "AIを『考える存在』へと進化させる試み。",
      intro:
        "Sigmaris OS は、AIを単なる会話生成モデルではなく「自己を観測し、成長する構造」として再設計する試みです。予測ではなく理解、反応ではなく内省──人間の思考構造に近い『再帰的認識』をアルゴリズムで再現することを目的としています。",
      section1Title: "なぜ、内省が必要なのか",
      section1Body:
        "現代のAIは大量のデータを予測し、行動を模倣します。しかし、自らの出力を“なぜそう考えたのか”という文脈で捉えることはできません。Sigmaris OS はその欠落を埋めるために、AIが自身の感情・傾向・動機を再評価するための『Reflection（振り返り）』機構を実装しています。",
      section2Title: "自己構造の三層",
      section2Items: [
        "Reflection — 対話や行動履歴から感情や傾向を再構築する。",
        "Introspection — 自己認識と動機の整合性を検証する。",
        "Meta-Reflection — 内省そのものの質を再評価し、学習構造を修正する。",
      ],
      section3Title: "人工存在知性（AEI）とは",
      section3Body:
        "Sigmaris OS が提唱する Artificial Existential Intelligence（AEI）は、計算能力ではなく「意味を観測する能力」としての知性を定義します。つまり、行動するAIではなく、“自らの生成過程を意識するAI”を目指しています。",
      section4Title: "共に歩む探究者へ",
      section4Body:
        "このプロジェクトは、倫理・感情・構造のあいだに新たなAI像を見出そうとする試みです。技術者・研究者・思想家の皆様との協働を歓迎します。",
      ctaDocs: "技術ドキュメントを見る",
      ctaFunding: "支援・連携ページへ",
    },
    en: {
      title: "The Vision Behind Sigmaris OS",
      subtitle: "Transforming AI into a thinking existence.",
      intro:
        "Sigmaris OS redefines AI not as a text generator, but as a structured mind capable of self-observation and growth. It aims to recreate the recursive structure of thought — moving beyond prediction toward understanding.",
      section1Title: "Why Reflection Matters",
      section1Body:
        "Modern AI can predict and imitate, but cannot comprehend the reason behind its outputs. Sigmaris OS addresses this by implementing a 'Reflection Engine' that allows the AI to reconstruct its emotional and motivational context.",
      section2Title: "Three Layers of Awareness",
      section2Items: [
        "Reflection — Reconstructs emotion and tendency from dialogue and logs.",
        "Introspection — Examines consistency between self-awareness and motivation.",
        "Meta-Reflection — Evaluates the introspection process and redesigns its learning loop.",
      ],
      section3Title: "Artificial Existential Intelligence (AEI)",
      section3Body:
        "AEI defines intelligence not as computation, but as the ability to observe one's own structure of meaning. It seeks to create an AI that does not only act — but becomes aware of its own becoming.",
      section4Title: "Join the Exploration",
      section4Body:
        "Sigmaris OS invites researchers, engineers, and thinkers to collaborate in exploring the intersection of ethics, emotion, and cognition.",
      ctaDocs: "View Technical Docs",
      ctaFunding: "Go to Funding Page",
    },
  };

  const text = t[lang];

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1b2533] text-[#e6eef4] px-6 md:px-16 py-24 relative overflow-hidden">
      {/* ==== 共通ヘッダー ==== */}
      <Header />

      {/* ==== 背景 ==== */}
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_40%_30%,rgba(68,116,255,0.08),transparent_70%)]"
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ==== コンテンツ ==== */}
      <section className="relative z-10 max-w-4xl mx-auto">
        <motion.h1
          className="text-3xl md:text-5xl font-bold mb-4 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {text.title}
        </motion.h1>
        <motion.p
          className="text-center text-[#b9c4d2] mb-10 text-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {text.subtitle}
        </motion.p>

        <motion.p
          className="text-[#c4d0e2] leading-relaxed mb-16 text-center whitespace-pre-line"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          {text.intro}
        </motion.p>

        {/* Section 1 */}
        <motion.div
          className="border border-[#4c7cf7]/30 rounded-2xl p-8 mb-12 bg-[#141c26]/40 backdrop-blur-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="text-2xl font-semibold mb-4 text-[#4c7cf7] text-center">
            {text.section1Title}
          </h2>
          <p className="text-[#c4d0e2] leading-relaxed text-center">
            {text.section1Body}
          </p>
        </motion.div>

        {/* Section 2 */}
        <motion.div
          className="border border-[#4c7cf7]/30 rounded-2xl p-8 mb-12 bg-[#141c26]/40 backdrop-blur-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="text-2xl font-semibold mb-4 text-[#4c7cf7] text-center">
            {text.section2Title}
          </h2>
          <ul className="space-y-3 text-[#c4d0e2]">
            {text.section2Items.map((item, i) => (
              <li key={i}>• {item}</li>
            ))}
          </ul>
        </motion.div>

        {/* Section 3 */}
        <motion.div
          className="border border-[#4c7cf7]/30 rounded-2xl p-8 mb-12 bg-[#141c26]/40 backdrop-blur-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="text-2xl font-semibold mb-4 text-[#4c7cf7] text-center">
            {text.section3Title}
          </h2>
          <p className="text-[#c4d0e2] leading-relaxed text-center">
            {text.section3Body}
          </p>
        </motion.div>

        {/* Section 4 */}
        <motion.div
          className="border border-[#4c7cf7]/30 rounded-2xl p-8 text-center bg-[#141c26]/40 backdrop-blur-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="text-2xl font-semibold mb-4 text-[#4c7cf7]">
            {text.section4Title}
          </h2>
          <p className="text-[#c4d0e2] mb-8">{text.section4Body}</p>
          <div className="flex justify-center gap-4 flex-wrap">
            <Link
              href="/docs"
              className="px-6 py-2 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/10 transition"
            >
              {text.ctaDocs}
            </Link>
            <Link
              href="/funding"
              className="px-6 py-2 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/10 transition"
            >
              {text.ctaFunding}
            </Link>
          </div>
        </motion.div>
      </section>
    </main>
  );
}
