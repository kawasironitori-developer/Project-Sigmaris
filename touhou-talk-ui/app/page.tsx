"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabaseClient";
import TopShell from "@/components/top/TopShell";

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
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
      setAuthChecked(true);
    };

    fetchUser();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
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
    () => ["考えが、うまく言葉にならないとき。", "少しだけ、話してみる場所。"],
    [],
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
  // ログイン画面へ（演出付き）
  // =========================
  const goLogin = () => {
    if (loading) return;

    setFog(true);
    setLoading(true);

    setTimeout(() => {
      router.push("/auth/login");
    }, 1200);
  };

  // =========================
  // チャットへ（演出付き）
  // =========================
  const enter = () => {
    if (loading) return;

    setFog(true);
    setLoading(true);

    setTimeout(() => {
      router.push("/map/session/gensokyo");
    }, 1200);
  };

  return (
    <TopShell fog={fog} loading={loading}>
      {/* =========================
          中央コンテンツ
         ========================= */}
      <div className="flex flex-col items-center justify-center gap-8 text-center">
        {/* タイピング文言 */}
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

        {/* ボタン群 */}
        {authChecked && (
          <div className="flex w-full max-w-xs flex-col gap-4">
            {!user && (
              <button
                onClick={goLogin}
                className="
                  rounded-xl
                  bg-white/85
                  px-8 py-4
                  text-lg font-medium
                  text-black
                  backdrop-blur
                  transition
                  hover:bg-white
                "
              >
                ログイン
              </button>
            )}

            {user && (
              <button
                onClick={enter}
                className="
                  rounded-xl
                  border border-white/60
                  px-8 py-3
                  text-sm
                  text-white
                  backdrop-blur
                  transition
                  hover:bg-white/20
                "
              >
                チャットへ
              </button>
            )}
          </div>
        )}
      </div>
    </TopShell>
  );
}
