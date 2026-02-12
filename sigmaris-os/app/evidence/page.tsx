"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Header from "@/components/Header";
import { SigmarisLangProvider, useSigmarisLang } from "@/lib/sigmarisLangContext";

export default function EvidencePage() {
  return (
    <SigmarisLangProvider>
      <EvidenceContent />
    </SigmarisLangProvider>
  );
}

function EvidenceContent() {
  const { lang } = useSigmarisLang();

  const t = {
    ja: {
      title: "Evidence（観測できる根拠）",
      lead:
        "Sigmaris OS は “説明” だけでなく、動作ログやメタ情報で検証できることを重視しています。\nここでは、第三者が確認できる観測ポイントをまとめます（会話本文は公開しません）。",
      itemsTitle: "確認できるもの",
      items: [
        {
          title: "Code Size（LOC）",
          body:
            "リポジトリ内の行数を集計して規模感を提示します。node_modules / .next 等は除外し、集計条件も表示します。",
          href: "/audit/code-size",
          cta: "LOCを確認",
        },
        {
          title: "Status / Telemetry",
          body:
            "内部状態のスナップショット（trait/value/global_state 等）の時系列を確認できます。運用時に“見える化”するためのページです。",
          href: "/status",
          cta: "状態を確認",
        },
        {
          title: "Audit（メタ監査）",
          body:
            "返信メタ（meta_v1 等）を中心に、意思決定候補・安全フラグ・テレメトリを監査できます。",
          href: "/audit",
          cta: "監査を見る",
        },
      ],
      myTitle: "自分のログ（要ログイン）",
      myBody:
        "あなたのアカウントに紐づく “件数/期間/メタのサンプル” を表示します。会話本文は表示しません。",
      myHref: "/evidence/my",
      myCta: "自分の証拠を見る",
      note:
        "注: /audit や /status はデータソース（Supabase等）の設定状況により表示内容が変わります。",
    },
    en: {
      title: "Evidence (Observable Proof)",
      lead:
        "Sigmaris OS values verifiability. This page lists observable evidence points.\nConversation contents are not publicly shown.",
      itemsTitle: "What you can verify",
      items: [
        {
          title: "Code Size (LOC)",
          body:
            "Shows repository size by counting lines. Excludes generated outputs like node_modules/.next, and displays counting options.",
          href: "/audit/code-size",
          cta: "View LOC",
        },
        {
          title: "Status / Telemetry",
          body:
            "Shows time-series snapshots (trait/value/global_state). Designed for operational observability.",
          href: "/status",
          cta: "View status",
        },
        {
          title: "Audit (meta)",
          body:
            "Inspects response metadata (meta_v1) such as decision candidates, safety flags, and telemetry.",
          href: "/audit",
          cta: "Open audit",
        },
      ],
      myTitle: "My logs (login required)",
      myBody:
        "Shows counts/ranges and small metadata samples for your account. Message contents are not displayed.",
      myHref: "/evidence/my",
      myCta: "Open my evidence",
      note:
        "Note: What you see depends on backend persistence configuration (e.g., Supabase).",
    },
  } as const;

  const text = t[lang];

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1b2533] text-[#e6eef4] px-6 md:px-16 py-24 relative overflow-hidden">
      <Header />

      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_35%_35%,rgba(68,116,255,0.08),transparent_70%)]"
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <section className="relative z-10 max-w-5xl mx-auto mt-20">
        <motion.h1
          className="text-3xl md:text-5xl font-bold mb-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {text.title}
        </motion.h1>

        <p className="text-[#b9c4d2] leading-relaxed whitespace-pre-line">
          {text.lead}
        </p>

        <h2 className="mt-10 text-xl font-semibold text-[#4c7cf7]">
          {text.itemsTitle}
        </h2>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-5">
          {text.items.map((it) => (
            <div
              key={it.href}
              className="border border-[#4c7cf7]/25 rounded-2xl p-6 backdrop-blur-md bg-[#141c26]/35"
            >
              <div className="text-lg font-semibold">{it.title}</div>
              <div className="mt-2 text-sm text-[#c4d0e2] leading-relaxed">
                {it.body}
              </div>
              <div className="mt-5">
                <Link
                  href={it.href}
                  className="inline-flex px-4 py-2 rounded-full border border-[#4c7cf7]/60 hover:bg-[#4c7cf7]/10 transition text-sm"
                >
                  {it.cta}
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 border border-[#4c7cf7]/25 rounded-2xl p-6 backdrop-blur-md bg-[#141c26]/35">
          <div className="text-lg font-semibold text-[#e6eef4]">
            {text.myTitle}
          </div>
          <div className="mt-2 text-sm text-[#c4d0e2] leading-relaxed">
            {text.myBody}
          </div>
          <div className="mt-5">
            <Link
              href={text.myHref}
              className="inline-flex px-4 py-2 rounded-full border border-[#4c7cf7]/60 hover:bg-[#4c7cf7]/10 transition text-sm"
            >
              {text.myCta}
            </Link>
          </div>
        </div>

        <div className="mt-8 text-xs text-[#8894a5]">{text.note}</div>
      </section>
    </main>
  );
}

