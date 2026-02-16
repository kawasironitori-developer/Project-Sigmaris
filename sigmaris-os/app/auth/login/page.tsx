"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import Header from "@/components/Header";
import { motion } from "framer-motion";
import Link from "next/link";
import React from "react";
import { SiDiscord, SiGithub, SiGoogle } from "react-icons/si";
import { SigmarisLangProvider, useSigmarisLang } from "@/lib/sigmarisLangContext";

type Provider = "google" | "github" | "discord";

const providerIcon: Record<
  Provider,
  React.ComponentType<{ className?: string; size?: number }>
> = {
  google: SiGoogle,
  github: SiGithub,
  discord: SiDiscord,
};

export default function LoginWrapper() {
  return (
    <SigmarisLangProvider>
      <LoginPage />
    </SigmarisLangProvider>
  );
}

function LoginPage() {
  const supabase = createClientComponentClient();
  const { lang } = useSigmarisLang();
  const [err, setErr] = React.useState<string | null>(null);
  const [desc, setDesc] = React.useState<string | null>(null);
  const [loadingProvider, setLoadingProvider] = React.useState<Provider | null>(
    null
  );

  const t = {
    ja: {
      title: "ログインしてください",
      subtitle: "Sigmaris OS にログインしてAI人格の内省を体験",
      buttons: {
        google: "Googleでログイン",
        github: "GitHubでログイン",
        discord: "Discordでログイン",
      } satisfies Record<Provider, string>,
      redirecting: "リダイレクト中…",
      webviewAlert:
        "このページはアプリ内ブラウザでは正常に動作しない場合があります。\\nChrome または Safari で開いてください。",
      loginErrorAlert:
        "ログインに失敗しました。\\nアプリ内ブラウザではなく、Chrome または Safari でお試しください。",
      back: "← Homeへ戻る",
    },
    en: {
      title: "Sign in to Sigmaris OS",
      subtitle: "Login to experience AI introspection & reflection",
      buttons: {
        google: "Sign in with Google",
        github: "Sign in with GitHub",
        discord: "Sign in with Discord",
      } satisfies Record<Provider, string>,
      redirecting: "Redirecting…",
      webviewAlert:
        "This page may not work correctly in an in-app browser.\\nPlease open it in Chrome or Safari.",
      loginErrorAlert:
        "Login failed.\\nPlease try again in Chrome or Safari (not an in-app browser).",
      back: "← Back to Home",
    },
  } as const;

  const text = t[lang];

  React.useEffect(() => {
    const ua = navigator.userAgent || "";
    const isWebView = /(FBAN|FBAV|Instagram|Line|Messenger|WebView|wv)/i.test(ua);
    if (isWebView) alert(text.webviewAlert);
  }, [text.webviewAlert]);

  React.useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      setErr(sp.get("error"));
      setDesc(sp.get("desc"));
    } catch {
      setErr(null);
      setDesc(null);
    }
  }, []);

  async function handleOAuth(provider: Provider) {
    if (loadingProvider) return;
    setErr(null);
    setDesc(null);
    setLoadingProvider(provider);

    try {
      const options: Record<string, any> = {
        redirectTo: `${window.location.origin}/auth/callback`,
      };
      if (provider === "google") {
        options.queryParams = {
          prompt: "select_account",
          access_type: "offline",
          response_type: "code",
        };
      }

      const { error } = await supabase.auth.signInWithOAuth({
        // Note: "X" is handled by Supabase provider name "twitter".
        provider,
        options,
      });

      if (error) {
        console.error("OAuth login error:", error.message);
        alert(text.loginErrorAlert);
      }
    } catch (e) {
      console.error("Unexpected login error:", e);
      alert(text.loginErrorAlert);
    } finally {
      setLoadingProvider(null);
    }
  }

  const providers: Provider[] = ["google", "github", "discord"];

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[#0e141b] to-[#1a2230] text-[#e6eef4] px-6 py-16 overflow-hidden">
      <Header />

      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(68,116,255,0.08),transparent_70%)]"
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="z-10 max-w-md w-full border border-[#4c7cf7]/30 rounded-2xl p-8 backdrop-blur-md bg-[#141c26]/60 text-center shadow-lg shadow-[#4c7cf7]/10"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        {err && (
          <div className="mb-6 text-left text-xs border border-red-400/30 bg-red-500/10 rounded-lg p-3 text-red-200">
            <div className="font-semibold">Login error: {err}</div>
            {desc && <div className="mt-1 opacity-90">{desc}</div>}
          </div>
        )}

        <h1 className="text-3xl font-bold mb-4 text-[#4c7cf7]">{text.title}</h1>
        <p className="text-[#c4d0e2] mb-8 text-sm leading-relaxed whitespace-pre-line">
          {text.subtitle}
        </p>

        <div className="grid grid-cols-1 gap-3">
          {providers.map((p) => {
            const Icon = providerIcon[p];
            const primary = p === "google";
            const label = loadingProvider === p ? text.redirecting : text.buttons[p];
            return (
              <button
                key={p}
                onClick={() => handleOAuth(p)}
                disabled={Boolean(loadingProvider)}
                className={
                  primary
                    ? "w-full flex items-center justify-center gap-2 bg-[#4c7cf7] hover:bg-[#3b6ce3] disabled:opacity-60 text-white font-semibold px-6 py-3 rounded-full transition"
                    : "w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 disabled:opacity-60 border border-white/15 text-white font-semibold px-6 py-3 rounded-full transition"
                }
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

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
