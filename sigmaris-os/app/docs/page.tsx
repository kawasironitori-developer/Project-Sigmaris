"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Header from "@/components/Header";
import { SigmarisLangProvider, useSigmarisLang } from "@/lib/sigmarisLangContext";

export default function DocsPage(): JSX.Element {
  return (
    <SigmarisLangProvider>
      <DocsContent />
    </SigmarisLangProvider>
  );
}

function DocsContent(): JSX.Element {
  const { lang } = useSigmarisLang();

  const t = {
    ja: {
      title: "ドキュメント",
      overviewTitle: "概要",
      overview:
        "Sigmaris OS は、LLMの外側に「人格/記憶/安全/状態/監査」を実装する Persona OS です。フロント（sigmaris-os）はログインとUIを担い、バックエンド（sigmaris_core）は /persona/chat などを提供します。",
      apiTitle: "API",
      api: [
        ["POST /persona/chat", "1ターンの応答生成（FastAPI / sigmaris_core）"],
        ["POST /persona/chat/stream", "SSEストリーミング応答（FastAPI / sigmaris_core）"],
        ["POST /io/web/search", "Web検索（Serper）"],
        ["POST /io/web/fetch", "Web本文取得→要約（ドメイン制限推奨）"],
        ["POST /io/upload", "添付アップロード（Supabase Storage優先）"],
        ["POST /io/parse", "添付解析（テキスト/画像など）"],
        ["GET /api/ops/code-stats", "コード行数集計（sigmaris-os / 要ログイン）"],
        ["GET /api/ops/portfolio-evidence", "自分のログ要約（本文なし / 要ログイン）"],
      ],
      back: "ホームへ戻る",
    },
    en: {
      title: "Docs",
      overviewTitle: "Overview",
      overview:
        "Sigmaris OS implements an external control layer for LLM operation (identity/memory/safety/state/audit). The frontend (sigmaris-os) handles login/UI, and the backend (sigmaris_core) provides /persona/chat and more.",
      apiTitle: "API",
      api: [
        ["POST /persona/chat", "Generate a single reply (FastAPI / sigmaris_core)"],
        ["POST /persona/chat/stream", "SSE streaming reply (FastAPI / sigmaris_core)"],
        ["POST /io/web/search", "Web search (Serper)"],
        ["POST /io/web/fetch", "Fetch page body -> summarize (allowlist recommended)"],
        ["POST /io/upload", "Upload attachments (prefers Supabase Storage)"],
        ["POST /io/parse", "Parse attachments (text/image, etc.)"],
        ["GET /api/ops/code-stats", "Compute LOC (sigmaris-os / auth required)"],
        ["GET /api/ops/portfolio-evidence", "My evidence summary (no contents / auth required)"],
      ],
      back: "Back to Home",
    },
  } as const;

  const text = t[lang];

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1a2230] text-[#e6eef4] px-6 md:px-16 py-24 relative overflow-hidden">
      <Header />

      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(68,116,255,0.08),transparent_70%)]"
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <section className="relative z-10 max-w-5xl mx-auto mt-20">
        <motion.h1
          className="text-4xl md:text-5xl font-bold mb-10 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
        >
          {text.title}
        </motion.h1>

        <div className="border border-[#4c7cf7]/30 rounded-2xl p-8 backdrop-blur-md bg-[#141c26]/40">
          <h2 className="text-xl font-semibold mb-3 text-[#4c7cf7]">
            {text.overviewTitle}
          </h2>
          <p className="text-[#c4d0e2] leading-relaxed whitespace-pre-line">
            {text.overview}
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3 text-[#4c7cf7]">
            {text.apiTitle}
          </h2>
          <ul className="space-y-2 text-[#c4d0e2]">
            {text.api.map(([ep, desc]) => (
              <li key={ep} className="flex flex-col md:flex-row md:gap-4">
                <span className="font-mono text-sm text-[#e6eef4] md:w-56">
                  {ep}
                </span>
                <span>{desc}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/home"
            className="px-8 py-3 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/10 transition"
          >
            {text.back}
          </Link>
        </div>
      </section>
    </main>
  );
}
