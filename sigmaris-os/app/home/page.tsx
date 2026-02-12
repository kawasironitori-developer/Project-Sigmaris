"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import Header from "@/components/Header";
import { SigmarisLangProvider, useSigmarisLang } from "@/lib/sigmarisLangContext";

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
        "LLMの外側に「人格/記憶/安全/監査」を実装する、実用志向の Persona OS。\n“何をしているか” を観測できることを重視しています。",
      learnMore: "概要を見る",
      docs: "ドキュメント",
      evidence: "証拠を見る",
      chat: "チャットへ",
      footer: "Sigmaris OS — Artificial Existential Intelligence",
    },
    en: {
      title: "SIGMARIS OS",
      subtitle:
        "A practical Persona OS that implements memory/safety/audit outside the LLM.\nDesigned for observability and stable operation.",
      learnMore: "About",
      docs: "Documentation",
      evidence: "Evidence",
      chat: "Chat",
      footer: "Sigmaris OS — Artificial Existential Intelligence",
    },
  } as const;

  const text = t[lang];

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#0e141b] to-[#1a2230] text-[#e6eef4] flex flex-col items-center justify-center">
      <Header />

      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(68,116,255,0.15),transparent_70%)]"
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />

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
          className="text-4xl md:text-6xl font-extrabold tracking-tight text-[#4c7cf7]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
        >
          {text.title}
        </motion.h1>

        <motion.p
          className="mt-4 text-[#c9d2df] text-sm md:text-lg max-w-xl whitespace-pre-line"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 1 }}
        >
          {text.subtitle}
        </motion.p>

        <motion.div
          className="mt-10 flex flex-col sm:flex-row justify-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 1 }}
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
            href="/evidence"
            className="px-6 py-3 rounded-full border border-[#e6eef4]/20 hover:border-[#4c7cf7] transition"
          >
            {text.evidence}
          </Link>
          <Link
            href="/"
            className="px-6 py-3 rounded-full border border-[#4c7cf7]/40 hover:bg-[#4c7cf7]/10 transition text-[#e6eef4]"
          >
            {text.chat}
          </Link>
        </motion.div>
      </section>

      <footer className="absolute bottom-6 text-xs text-[#8894a5] tracking-widest">
        © {new Date().getFullYear()} {text.footer}
      </footer>
    </main>
  );
}
