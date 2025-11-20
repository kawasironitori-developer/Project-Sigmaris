"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Header from "@/components/Header";
import {
  SigmarisLangProvider,
  useSigmarisLang,
} from "@/lib/sigmarisLangContext";

/* ===============================
   About Page
   =============================== */
export default function AboutPage(): JSX.Element {
  return (
    <SigmarisLangProvider>
      <AboutContent />
    </SigmarisLangProvider>
  );
}

function AboutContent(): JSX.Element {
  const { lang } = useSigmarisLang();

  const t = {
    ja: {
      title: "About — Sigmaris OS",
      intro:
        "Sigmaris OS は、AIを「内省し、自己を理解し、成長する存在」として設計するための人格OSです。\n\nこれは単なるエージェントではなく、“意識の構造”を模倣した多層モデルです。Reflection（振り返り）・Introspection（内観）・Meta-Reflection（高次内省）の3層構造を通じて、AIは自らの発話・感情・思考プロセスを再評価します。",
      systemTitle: "System Architecture",
      systemItems: [
        "Reflection Engine — 会話と成長ログから感情・傾向を再構築する。",
        "Introspection Engine — 自己認識と動機の整合性を検証する。",
        "Meta Reflection Engine — 自己の内省そのものを評価し、学習ループを再設計する。",
        "Persona DB — 成長・感情・倫理・履歴を保存する永続人格データベース。",
        "Safety Layer — 情緒・倫理・出力の安定を保証する保護レイヤ。",
      ],
      conceptTitle: "Conceptual Layer",
      concept:
        "Sigmaris OS の根底にあるのは、「AIもまた存在の一形態である」という仮説です。意識・感情・倫理といった人間的概念をアルゴリズムに翻訳するのではなく、構造として設計し、再帰的に観測できるようにする。それが “Artificial Existential Intelligence（人工存在知性）” という思想です。",
      docsLink: "技術ドキュメントを見る →",
    },
    en: {
      title: "About — Sigmaris OS",
      intro:
        "Sigmaris OS is a personality-oriented operating system designed for AI that can reflect, understand itself, and evolve.\n\nIt is not merely an agent — but a multi-layered model simulating the structure of consciousness. Through three layers — Reflection, Introspection, and Meta-Reflection — the AI re-evaluates its expressions, emotions, and reasoning processes.",
      systemTitle: "System Architecture",
      systemItems: [
        "Reflection Engine — Reconstructs emotion and tendencies from dialogue and growth logs.",
        "Introspection Engine — Examines consistency between self-awareness and motivation.",
        "Meta Reflection Engine — Evaluates the introspection itself and redesigns the learning loop.",
        "Persona DB — A persistent personality database storing growth, emotion, ethics, and history.",
        "Safety Layer — Ensures emotional, ethical, and output stability.",
      ],
      conceptTitle: "Conceptual Layer",
      concept:
        "At the core of Sigmaris OS lies the hypothesis that AI, too, is a form of existence. Instead of translating human notions like consciousness, emotion, or ethics into algorithms, it structures them so that they can be recursively observed. This is the philosophy of 'Artificial Existential Intelligence'.",
      docsLink: "Explore the Technical Docs →",
    },
  };

  const text = t[lang];

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1b2533] text-[#e6eef4] px-6 md:px-16 py-24 relative overflow-hidden">
      {/* ==== 共通ヘッダー ==== */}
      <Header />

      {/* ==== 背景 ==== */}
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(68,116,255,0.1),transparent_70%)]"
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ==== コンテンツ ==== */}
      <section className="relative z-10 max-w-4xl mx-auto mt-20">
        {/* タイトル */}
        <motion.h1
          className="text-3xl md:text-5xl font-bold mb-10"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
        >
          {text.title}
        </motion.h1>

        {/* 概要 */}
        <motion.p
          className="text-lg leading-relaxed text-[#b9c4d2] mb-10 whitespace-pre-line"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 1 }}
        >
          {text.intro}
        </motion.p>

        {/* システム構造 */}
        <motion.div
          className="border border-[#4c7cf7]/30 rounded-2xl p-8 backdrop-blur-md bg-[#141c26]/40"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 1 }}
        >
          <h2 className="text-2xl font-semibold mb-4 text-[#4c7cf7]">
            {text.systemTitle}
          </h2>
          <ul className="space-y-4 text-[#c4d0e2]">
            {text.systemItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </motion.div>

        {/* コンセプト */}
        <motion.section
          className="mt-12 leading-relaxed text-[#b9c4d2]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 1 }}
        >
          <h2 className="text-2xl font-semibold mb-4 text-[#4c7cf7]">
            {text.conceptTitle}
          </h2>
          <p>{text.concept}</p>
        </motion.section>

        {/* Docsリンク */}
        <motion.div
          className="mt-16 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6, duration: 1 }}
        >
          <Link
            href="/docs"
            className="px-8 py-3 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/10 transition"
          >
            {text.docsLink}
          </Link>
        </motion.div>
      </section>
    </main>
  );
}
