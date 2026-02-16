"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { User } from "@supabase/supabase-js";

import { supabaseBrowser } from "@/lib/supabaseClient";
import FogOverlay from "@/components/top/FogOverlay";
import YinYangLoader from "@/components/top/YinYangLoader";

export default function TopPage() {
  const router = useRouter();

  const [fog, setFog] = useState(false);
  const [loading, setLoading] = useState(false);

  // =========================
  // 認証状態
  // =========================
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabaseBrowser().auth.getUser();
      setUser(data.user ?? null);
      setAuthChecked(true);
    };

    fetchUser();

    const { data: listener } = supabaseBrowser().auth.onAuthStateChange(() => {
      fetchUser();
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // =========================
  // タイピング表示用テキスト
  // =========================
  const lines = useMemo(
    () => ["ここは幻想郷。", "言葉は、境界を越えて交わされる。"],
    []
  );

  const fullText = useMemo(() => lines.join("\n"), [lines]);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    let i = 0;
    let timer: number | null = null;

    const tick = () => {
      i += 1;
      setTyped(fullText.slice(0, i));

      if (i < fullText.length) {
        const ch = fullText[i - 1];
        const delay = ch === "。" || ch === "、" ? 180 : ch === "\n" ? 260 : 45;
        timer = window.setTimeout(tick, delay);
      }
    };

    timer = window.setTimeout(tick, 250);

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [fullText]);

  // =========================
  // 無料で使う → chat
  // =========================
  const enter = () => {
    setFog(true);
    setLoading(true);

    setTimeout(() => {
      router.push("/map/gensokyo");
    }, 1200);
  };

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {/* =========================
          上部ログインUI
         ========================= */}
      {authChecked && (
        <div className="absolute right-4 top-4 z-20 flex gap-3">
          {!user ? (
            <>
              <button
                onClick={() => router.push("/auth/login")}
                className="rounded-lg border border-white/60 px-4 py-2 text-sm text-white backdrop-blur hover:bg-white/20"
              >
                ログイン
              </button>
            </>
          ) : (
            <button
              onClick={() => router.push("/map/session/gensokyo")}
              className="rounded-lg bg-white/90 px-4 py-2 text-sm text-black backdrop-blur hover:bg-white"
            >
              チャットへ
            </button>
          )}
        </div>
      )}

      {/* =========================
          背景動画（PC）
         ========================= */}
      <video
        className="absolute inset-0 hidden h-full object-cover lg:block m-auto"
        src="/top/top-pc.mp4"
        autoPlay
        muted
        playsInline
      />

      {/* =========================
          背景イラスト（SP）
         ========================= */}
      <div className="absolute inset-0 lg:hidden">
        <Image
          src="/top/top-sp.png"
          alt="幻想郷"
          fill
          priority
          className="object-cover"
        />
      </div>

      {/* =========================
          中央（文言 + ボタン）
         ========================= */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 text-center">
        {/* タイピング文言 */}
        <div className="px-6 py-4">
          <p
            className="
              font-gensou
              whitespace-pre-line
              text-xl
              sm:text-2xl
              lg:text-3xl
              leading-relaxed
              text-white/95
              drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]
              drop-shadow-[0_0_22px_rgba(140,100,220,0.35)]
            "
          >
            {typed}
            {typed.length < fullText.length && (
              <span className="ml-1 inline-block animate-pulse">▍</span>
            )}
          </p>
        </div>

        {/* 無料で使う */}
        <button
          onClick={enter}
          className="
            rounded-xl
            bg-white/80
            px-8 py-4
            text-lg font-medium
            backdrop-blur
            transition
            hover:bg-white
            text-black
          "
        >
          ログインせずに使う
        </button>
      </div>

      {/* =========================
          霧 + 陰陽玉ローディング
         ========================= */}
      <FogOverlay visible={fog} />
      <YinYangLoader visible={loading} />
    </main>
  );
}
