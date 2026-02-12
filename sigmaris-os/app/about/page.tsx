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
        "Sigmaris OS は、LLMの外側に「人格/記憶/安全/監査」を実装する Persona OS です。\n\n狙いは “賢く見える応答” ではなく、運用上の安定性と再現性です。\n- 何を参照して答えたか\n- どういう安全判断が入ったか\n- どの設定で生成したか\nをメタ情報として観測できるようにしています。",
      systemTitle: "System Architecture",
      systemItems: [
        "Backend (sigmaris_core/FastAPI) — /persona/chat, /io/* を提供",
        "Persona Controller — 記憶/同一性/状態/安全の統合で1ターンを生成",
        "Safety Layer — 危険度スコアリングと出力方針の調整",
        "Phase04 I/O — Web検索/取得/添付解析（監査ログ・キャッシュ対応）",
        "Supabase — 認証/永続化（messages/state/audit）",
      ],
      conceptTitle: "Conceptual Layer",
      concept:
        "Sigmaris OS は “OSとしての境界” を重視します。モデル（LLM）を直接改変せず、外側の層で運用ルールと観測性を担保することで、改善と再現性を両立します。",
      docsLink: "技術ドキュメントを見る →",
    },
    en: {
      title: "About — Sigmaris OS",
      intro:
        "Sigmaris OS is a Persona OS that implements memory/safety/audit outside the LLM.\n\nThe goal is stable operation and reproducibility — not just “smart-looking” outputs. It emphasizes observability via response metadata.",
      systemTitle: "System Architecture",
      systemItems: [
        "Backend (sigmaris_core/FastAPI) — /persona/chat, /io/* endpoints",
        "Persona Controller — integrates memory/identity/state/safety per turn",
        "Safety Layer — risk scoring and output policy",
        "Phase04 I/O — web search/fetch & attachment parsing (audit + cache)",
        "Supabase — auth + persistence (messages/state/audit)",
      ],
      conceptTitle: "Conceptual Layer",
      concept:
        "Sigmaris OS treats the LLM as a component and enforces operational boundaries in an external layer. This helps continuous improvement without losing reproducibility.",
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
