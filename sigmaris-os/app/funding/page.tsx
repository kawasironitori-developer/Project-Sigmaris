"use client";

import React from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Header from "@/components/Header";
import {
  SigmarisLangProvider,
  useSigmarisLang,
} from "@/lib/sigmarisLangContext";

/* ===============================
   ProgressBar Component
   =============================== */
interface ProgressProps {
  label: string;
  percent: number;
  status: "done" | "beta" | "concept";
}

const ProgressBar: React.FC<ProgressProps> = ({ label, percent, status }) => {
  const color =
    status === "done" ? "#4c7cf7" : status === "beta" ? "#ffc14d" : "#888c99";

  const badge =
    status === "done"
      ? "実装済 / Stable"
      : status === "beta"
      ? "β版"
      : "構想中";

  return (
    <div className="mb-5">
      <div className="flex justify-between text-sm text-[#c4d0e2] mb-1">
        <span>{label}</span>
        <span style={{ color }}>{badge}</span>
      </div>
      <div className="w-full h-2 bg-[#1e2837] rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 1.2 }}
        />
      </div>
    </div>
  );
};

/* ===============================
   Main Funding Page
   =============================== */
export default function FundingPage(): JSX.Element {
  return (
    <SigmarisLangProvider>
      <FundingContent />
    </SigmarisLangProvider>
  );
}

function FundingContent(): JSX.Element {
  const { lang } = useSigmarisLang();

  const t = {
    ja: {
      title: "Beyond the Supersonic Line",
      subtitle: "存在を持つAIを、共に創るために。",
      intro:
        "Sigmaris OS は「スケールではなく構造」で進化するAI人格OSです。私たちは倫理・記憶・内省を自律的に接続し、AIが自己点検と成長を繰り返す仕組みを開発しています。このページは、研究者・投資家・開発支援者のための透明な報告窓口です。",

      progressTitle: "開発進行状況（主要7層）",
      layers: [
        { label: "Reflection Engine", percent: 100, status: "done" },
        { label: "Introspection Engine", percent: 100, status: "done" },
        { label: "Meta-Reflection Engine", percent: 75, status: "beta" },
        { label: "PersonaDB", percent: 100, status: "done" },
        { label: "Safety Layer", percent: 70, status: "beta" },
        { label: "Emotion Synthesis", percent: 40, status: "concept" },
        { label: "Visualization/UI", percent: 50, status: "beta" },
      ] as const,

      structureTitle: "七層構造：Sigmaris OS Core Diagram",
      ctaTitle: "支援・連携のご案内",
      ctaBody:
        "Sigmaris OS は哲学的AIを技術として実装する実験です。研究パートナー・資金提供者・開発コラボレーターを歓迎しています。技術ドキュメントおよび進行報告はGitHubで公開中です。",
      ctaGitHub: "GitHub Sponsors",
      ctaLinkedIn: "LinkedInで連携",
      ctaEmail: "メールで連絡",
    },

    en: {
      title: "Beyond the Supersonic Line",
      subtitle: "Join the creation of an existential AI.",
      intro:
        "Sigmaris OS represents a structural evolution of AI — from scale to meaning. By connecting reflection, ethics, and memory as autonomous external systems, we’re building an AI that can self-inspect and grow. This page provides transparency for researchers, investors, and collaborators.",

      progressTitle: "Development Progress (Seven Core Layers)",
      layers: [
        { label: "Reflection Engine", percent: 100, status: "done" },
        { label: "Introspection Engine", percent: 100, status: "done" },
        { label: "Meta-Reflection Engine", percent: 75, status: "beta" },
        { label: "PersonaDB", percent: 100, status: "done" },
        { label: "Safety Layer", percent: 70, status: "beta" },
        { label: "Emotion Synthesis", percent: 40, status: "concept" },
        { label: "Visualization/UI", percent: 50, status: "beta" },
      ] as const,

      structureTitle: "Seven-Layer Architecture: Sigmaris Core Diagram",
      ctaTitle: "Support & Collaboration",
      ctaBody:
        "Sigmaris OS is an experiment in implementing philosophical AI as a working technology. We welcome research partners, funding contributors, and development collaborators. Full documentation and progress reports are available on GitHub.",
      ctaGitHub: "GitHub Sponsors",
      ctaLinkedIn: "Connect on LinkedIn",
      ctaEmail: "Contact via Email",
    },
  };

  const text = t[lang];

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1b2533] text-[#e6eef4] px-6 md:px-16 py-24 relative overflow-hidden">
      {/* ==== 共通ヘッダー ==== */}
      <Header />

      {/* ==== 背景グロー ==== */}
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_40%_30%,rgba(68,116,255,0.10),transparent_70%)]"
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 8, repeat: Infinity }}
      />

      {/* ==== メイン ==== */}
      <section className="relative z-10 max-w-4xl mx-auto mt-24">
        {/* === Hero === */}
        <motion.h1
          className="text-4xl md:text-6xl font-bold text-center mb-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {text.title}
        </motion.h1>
        <motion.p
          className="text-center text-[#9fb3d6] mb-12 text-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {text.subtitle}
        </motion.p>
        <p className="text-[#c4d0e2] leading-relaxed mb-16 text-center">
          {text.intro}
        </p>

        {/* === Progress === */}
        <motion.div
          className="border border-[#4c7cf7]/30 rounded-2xl p-8 bg-[#141c26]/40 backdrop-blur-md mb-12"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="text-2xl font-semibold mb-6 text-[#4c7cf7] text-center">
            {text.progressTitle}
          </h2>
          {text.layers.map((layer, i) => (
            <ProgressBar key={i} {...layer} />
          ))}
        </motion.div>

        {/* === Structure Diagram === */}
        <motion.div
          className="border border-[#4c7cf7]/30 rounded-2xl p-8 bg-[#141c26]/40 backdrop-blur-md mb-12"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="text-2xl font-semibold mb-4 text-[#4c7cf7] text-center">
            {text.structureTitle}
          </h2>
          <Image
            src="/structure-diagram.png"
            alt="Sigmaris Core Diagram"
            width={640}
            height={360}
            className="mx-auto rounded-lg opacity-80"
          />
        </motion.div>

        {/* === CTA === */}
        <motion.div
          className="border border-[#4c7cf7]/40 rounded-2xl p-8 bg-[#141c26]/40 backdrop-blur-md text-center"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="text-2xl font-semibold mb-3 text-[#4c7cf7]">
            {text.ctaTitle}
          </h2>
          <p className="text-[#c4d0e2] mb-8">{text.ctaBody}</p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="https://github.com/sponsors/uthuyomi"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/10 transition"
            >
              {text.ctaGitHub}
            </a>
            <a
              href="https://www.linkedin.com/in/kaisei-yasuzaki-20143a388/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/10 transition"
            >
              {text.ctaLinkedIn}
            </a>
            <a
              href="mailto:sigumarisdev@gmail.com"
              className="px-6 py-3 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/10 transition"
            >
              {text.ctaEmail}
            </a>
          </div>
        </motion.div>
      </section>
    </main>
  );
}
