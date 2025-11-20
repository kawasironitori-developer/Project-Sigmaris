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

export default function TokushohoPage(): JSX.Element {
  return (
    <SigmarisLangProvider>
      <TokushohoContent />
    </SigmarisLangProvider>
  );
}

function TokushohoContent(): JSX.Element {
  const { lang } = useSigmarisLang();

  const t = {
    ja: {
      title: "特定商取引法に基づく表記",
      subtitle:
        "本ページは、日本国内でのオンライン販売に関する法令に基づき、Sigmaris OSの取引条件を明示するものです。",
      items: [
        { label: "販売業者", value: "安崎 海星（個人事業）" },
        { label: "運営統括責任者", value: "安崎 海星" },
        {
          label: "所在地",
          value:
            "北海道札幌市（※詳細住所はご請求があった場合に遅延なく開示いたします）",
        },
        { label: "電話番号", value: "（ご請求時に開示いたします）" },
        { label: "メールアドレス", value: "sigumarisdev@gmail.com" },
        { label: "販売URL", value: "https://sigmaris-os.vercel.app/plans" },
        {
          label: "販売価格",
          value: "各プランページに記載（例：Basic ¥1,000 / Advanced ¥3,000）",
        },
        {
          label: "商品代金以外の必要料金",
          value: "振込手数料・通信費等はお客様負担となります。",
        },
        { label: "支払い方法", value: "クレジットカード決済（Stripe）" },
        { label: "支払い時期", value: "ご注文確定時に決済が行われます。" },
        {
          label: "商品の引渡し時期",
          value: "決済完了後、即時にサービスをご利用いただけます。",
        },
        {
          label: "返品・キャンセル",
          value:
            "デジタルコンテンツの性質上、購入後の返金・キャンセルはお受けしておりません。",
        },
        {
          label: "動作環境",
          value: "PCまたはスマートフォン（最新ブラウザ推奨）",
        },
      ],
      back: "← プランページに戻る",
    },
    en: {
      title: "Legal Notice (Japan: Act on Specified Commercial Transactions)",
      subtitle:
        "This page outlines the legally required information under Japan’s Act on Specified Commercial Transactions for Sigmaris OS.",
      items: [
        { label: "Seller", value: "Kaisei Yasuzaki (Sole Proprietor)" },
        { label: "Responsible Person", value: "Kaisei Yasuzaki" },
        {
          label: "Address",
          value:
            "Sapporo, Hokkaido (Full address available upon request for legal purposes)",
        },
        { label: "Phone", value: "Provided upon legal request" },
        { label: "Email", value: "sigumarisdev@gmail.com" },
        { label: "Website URL", value: "https://sigmaris-os.vercel.app/plans" },
        {
          label: "Price",
          value:
            "Listed on each plan page (e.g., Basic ¥1,000 / Advanced ¥3,000)",
        },
        {
          label: "Additional Fees",
          value:
            "Bank transfer fees or communication costs are borne by the customer.",
        },
        { label: "Payment Method", value: "Credit Card via Stripe" },
        {
          label: "Payment Timing",
          value: "Charged immediately upon order confirmation.",
        },
        {
          label: "Service Delivery",
          value: "Available immediately after payment confirmation.",
        },
        {
          label: "Refund / Cancellation",
          value:
            "Due to the nature of digital content, refunds or cancellations are not accepted after purchase.",
        },
        {
          label: "System Requirements",
          value: "PC or smartphone (latest browser recommended)",
        },
      ],
      back: "← Back to Plans",
    },
  };

  const text = lang === "ja" ? t.ja : t.en;

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1a2230] text-[#e6eef4] px-6 md:px-16 py-24 relative overflow-hidden">
      {/* ==== 共通ヘッダー ==== */}
      <Header />

      {/* ==== 背景アニメーション ==== */}
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(68,116,255,0.1),transparent_70%)]"
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ==== コンテンツ ==== */}
      <section className="relative z-10 max-w-4xl mx-auto mt-24">
        <motion.h1
          className="text-3xl md:text-5xl font-bold mb-6 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
        >
          {text.title}
        </motion.h1>

        <motion.p
          className="text-center text-[#b9c4d2] mb-10 max-w-3xl mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 1 }}
        >
          {text.subtitle}
        </motion.p>

        <motion.div
          className="border border-[#4c7cf7]/30 rounded-2xl p-8 backdrop-blur-md bg-[#141c26]/40 text-[#c4d0e2]"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 1 }}
        >
          <ul className="space-y-4">
            {text.items.map((item, i) => (
              <li key={i} className="flex flex-col md:flex-row md:gap-4">
                <span className="font-semibold text-[#4c7cf7] w-48 shrink-0">
                  {item.label}
                </span>
                <span>{item.value}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          className="mt-16 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
        >
          <Link
            href="/plans"
            className="px-8 py-3 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/10 transition"
          >
            {text.back}
          </Link>
        </motion.div>
      </section>
    </main>
  );
}
