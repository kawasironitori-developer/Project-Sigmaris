"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { motion } from "framer-motion";
import Link from "next/link";
import React from "react";
import {
  SigmarisLangProvider,
  useSigmarisLang,
} from "@/lib/sigmarisLangContext";

/* 🧩 ラッパーでProviderを適用 */
export default function LoginWrapper() {
  return (
    <SigmarisLangProvider>
      <LoginPage />
    </SigmarisLangProvider>
  );
}

/* 🧠 本体 */
function LoginPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const { lang } = useSigmarisLang();

  // 🧭 アプリ内ブラウザ検出（Googleポリシー違反回避）
  React.useEffect(() => {
    const ua = navigator.userAgent || "";
    const isWebView = /(FBAN|FBAV|Instagram|Line|Messenger|WebView|wv)/i.test(
      ua
    );
    if (isWebView) {
      alert(
        "このページはアプリ内ブラウザでは正しく動作しません。\nChrome または Safari で開いてください。"
      );
    }
  }, []);

  // ✅ Googleログイン処理（安全ブラウザ対応）
  async function handleLogin() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            prompt: "select_account", // Google再認証促進
            access_type: "offline", // 長期セッションを許可
            response_type: "code",
          },
        },
      });

      if (error) {
        console.error("Google login error:", error.message);
        alert(
          "Googleログインに失敗しました。\nアプリ内ブラウザではなく、Chrome または Safari でお試しください。"
        );
      }
    } catch (e) {
      console.error("Unexpected login error:", e);
      alert("予期しないエラーが発生しました。しばらくして再試行してください。");
    }
  }

  /* 🌐 言語テキスト */
  const t = {
    ja: {
      title: "ログインしてください",
      subtitle: "Sigmaris OS にログインしてAI人格の内省を体験",
      button: "Googleでログイン",
      back: "← Homeへ戻る",
    },
    en: {
      title: "Sign in to Sigmaris OS",
      subtitle: "Login to experience AI introspection & reflection",
      button: "Sign in with Google",
      back: "← Back to Home",
    },
  } as const;

  const text = t[lang];

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[#0e141b] to-[#1a2230] text-[#e6eef4] px-6 py-16 overflow-hidden">
      <Header />

      {/* 背景アニメーション */}
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(68,116,255,0.08),transparent_70%)]"
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* コンテンツ */}
      <motion.div
        className="z-10 max-w-md w-full border border-[#4c7cf7]/30 rounded-2xl p-8 backdrop-blur-md bg-[#141c26]/60 text-center shadow-lg shadow-[#4c7cf7]/10"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <h1 className="text-3xl font-bold mb-4 text-[#4c7cf7]">{text.title}</h1>
        <p className="text-[#c4d0e2] mb-8 text-sm leading-relaxed whitespace-pre-line">
          {text.subtitle}
        </p>

        {/* Googleログインボタン */}
        <button
          onClick={handleLogin}
          className="w-full bg-[#4c7cf7] hover:bg-[#3b6ce3] text-white font-semibold px-6 py-3 rounded-full transition"
        >
          {text.button}
        </button>

        <div className="my-6 border-t border-[#4c7cf7]/20" />

        <Link
          href="/home"
          className="text-[#a8b3c7] text-sm hover:text-[#4c7cf7] transition"
        >
          {text.back}
        </Link>
      </motion.div>
    </main>
  );
}
