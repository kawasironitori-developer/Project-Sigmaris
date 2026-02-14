"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useSigmarisLang } from "@/lib/sigmarisLangContext";

export default function Header() {
  const { lang, setLang } = useSigmarisLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const supabase = createClientComponentClient();

  // ✅ ログイン状態・残高を取得
  useEffect(() => {
    const loadUser = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const currentUser = userData?.user ?? null;
      setUser(currentUser);
    };
    loadUser();
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  };

  const text = {
    home: lang === "ja" ? "ホーム" : "Home",
    about: lang === "ja" ? "概要" : "About",
    sigmaris: "Sigmaris",
    vision: lang === "ja" ? "理念" : "Vision",
    docs: lang === "ja" ? "ドキュメント" : "Docs",
    status: lang === "ja" ? "状態" : "Status",
    audit: lang === "ja" ? "監査" : "Audit",
    codeSize: lang === "ja" ? "規模" : "Code Size",
    memory: lang === "ja" ? "メモリ" : "Memory",
    funding: lang === "ja" ? "支援" : "Funding",
    tokushoho: lang === "ja" ? "特定商取引法" : "Legal",
    switch: lang === "ja" ? "EN" : "JP",
    login: lang === "ja" ? "ログイン" : "Login",
    signup: lang === "ja" ? "新規登録" : "Sign Up",
    logout: lang === "ja" ? "ログアウト" : "Logout",
    chat: lang === "ja" ? "チャットへ" : "Chat",
    account: lang === "ja" ? "アカウント" : "Account",
  };

  return (
    <motion.header
      className="fixed top-0 left-0 w-full z-50 bg-[#0e141b]/80 backdrop-blur-lg border-b border-[#1f2835]"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* === 上段：ロゴ＋メニュー === */}
      <div className="px-6 py-3 flex items-center justify-between">
        {/* === ロゴ === */}
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

        {/* === PC用ナビ === */}
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link href="/about" className="text-[#c9d2df] hover:text-[#4c7cf7]">
            {text.about}
          </Link>
          <Link
            href="/about/sigmaris"
            className="text-[#c9d2df] hover:text-[#4c7cf7]"
          >
            {text.sigmaris}
          </Link>
          <Link href="/vision" className="text-[#c9d2df] hover:text-[#4c7cf7]">
            {text.vision}
          </Link>
          <Link href="/docs" className="text-[#c9d2df] hover:text-[#4c7cf7]">
            {text.docs}
          </Link>
          <Link href="/status" className="text-[#c9d2df] hover:text-[#4c7cf7]">
            {text.status}
          </Link>
          <Link href="/audit" className="text-[#c9d2df] hover:text-[#4c7cf7]">
            {text.audit}
          </Link>
          <Link
            href="/audit/code-size"
            className="text-[#c9d2df] hover:text-[#4c7cf7]"
          >
            {text.codeSize}
          </Link>
          <Link href="/memory" className="text-[#c9d2df] hover:text-[#4c7cf7]">
            {text.memory}
          </Link>
          <Link href="/funding" className="text-[#c9d2df] hover:text-[#4c7cf7]">
            {text.funding}
          </Link>
          <Link
            href="/tokushoho"
            className="text-[#c9d2df] hover:text-[#4c7cf7]"
          >
            {text.tokushoho}
          </Link>

          {/* 言語切替 */}
          <button
            onClick={() => setLang(lang === "ja" ? "en" : "ja")}
            className="ml-2 px-3 py-1 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/20 transition"
          >
            {text.switch}
          </button>
        </nav>

        {/* === モバイルメニュー === */}
        <button
          className="md:hidden flex flex-col justify-center items-center w-8 h-8 focus:outline-none"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span
            className={`block w-6 h-0.5 bg-[#e6eef4] transition-all duration-300 ${
              menuOpen ? "rotate-45 translate-y-1.5" : ""
            }`}
          />
          <span
            className={`block w-6 h-0.5 bg-[#e6eef4] my-1 transition-all duration-300 ${
              menuOpen ? "opacity-0" : ""
            }`}
          />
          <span
            className={`block w-6 h-0.5 bg-[#e6eef4] transition-all duration-300 ${
              menuOpen ? "-rotate-45 -translate-y-1.5" : ""
            }`}
          />
        </button>
      </div>

      {/* === 下段：アカウント情報 === */}
      <div className="px-6 py-2 border-t border-[#1f2835] bg-[#0c1219]/90 flex flex-wrap justify-between items-center text-xs text-[#c9d2df]">
        {user ? (
          <>
            <div className="flex items-center gap-4 flex-wrap">
              <span>👤 {user.email?.split("@")[0]}</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Link
                href="/"
                className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 transition text-white"
              >
                {text.chat}
              </Link>
              <Link
                href="/account"
                className="px-3 py-1 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/20 transition"
              >
                {text.account}
              </Link>
              <button
                onClick={handleLogout}
                className="px-3 py-1 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/20 transition"
              >
                {text.logout}
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="px-3 py-1 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/20 transition"
            >
              {text.login}
            </Link>
            <Link
              href="/auth/signup"
              className="px-3 py-1 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/20 transition"
            >
              {text.signup}
            </Link>
          </div>
        )}
      </div>

      {/* === モバイル展開メニュー === */}
      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            key="mobile-nav"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="absolute top-16 left-0 w-full bg-[#0e141b]/95 backdrop-blur-xl border-t border-[#1f2835] flex flex-col items-center gap-5 py-6 text-sm md:hidden"
          >
            {[
              { href: "/about", label: text.about },
              { href: "/about/sigmaris", label: text.sigmaris },
              { href: "/vision", label: text.vision },
              { href: "/docs", label: text.docs },
              { href: "/status", label: text.status },
              { href: "/audit", label: text.audit },
              { href: "/audit/code-size", label: text.codeSize },
              { href: "/memory", label: text.memory },
              { href: "/funding", label: text.funding },
              { href: "/tokushoho", label: text.tokushoho },
            ].map((link, i) => (
              <Link
                key={i}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="hover:text-[#4c7cf7] transition"
              >
                {link.label}
              </Link>
            ))}

            {/* 言語切替（スマホ用） */}
            <button
              onClick={() => {
                setLang(lang === "ja" ? "en" : "ja");
                setMenuOpen(false);
              }}
              className="mt-2 px-4 py-1 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/20 transition"
            >
              {text.switch}
            </button>

            {/* 下段：モバイル用アカウント */}
            {user && (
              <div className="mt-4 text-xs text-[#c9d2df] flex flex-col items-center gap-2">
                <span>👤 {user.email?.split("@")[0]}</span>
                <Link
                  href="/"
                  onClick={() => setMenuOpen(false)}
                  className="px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition"
                >
                  {text.chat}
                </Link>
                <button
                  onClick={handleLogout}
                  className="px-4 py-1 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/20 transition"
                >
                  {text.logout}
                </button>
              </div>
            )}
          </motion.nav>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
