"use client";

import React, { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { motion } from "framer-motion";
import {
  SigmarisLangProvider,
  useSigmarisLang,
} from "@/lib/sigmarisLangContext";

/* ----------------------------
   🌐 Account Wrapper with Lang
----------------------------- */
export default function AccountWrapper() {
  return (
    <SigmarisLangProvider>
      <AccountPage />
    </SigmarisLangProvider>
  );
}

/* ----------------------------
   🧠 AccountPage 本体
----------------------------- */
function AccountPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const { lang } = useSigmarisLang();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [reflections, setReflections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ ユーザー情報・プロフィール・履歴を取得
  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        router.replace("/auth/login");
        return;
      }
      setUser(data.user);

      // --- user_profiles 取得 ---
      const { data: profileData } = await supabase
        .from("user_profiles")
        .select("plan, credit_balance, trial_end")
        .eq("auth_user_id", data.user.id)
        .maybeSingle();

      setProfile(profileData || {});

      // --- reflections取得 ---
      // reflection列が存在しない場合に備え二重フェッチ
      let reflectData: any[] = [];
      const { data: tryReflection, error } = await supabase
        .from("reflections")
        .select("reflection, created_at")
        .eq("user_id", data.user.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) {
        // reflectionが存在しないDB構造へのフォールバック
        const { data: alt } = await supabase
          .from("reflections")
          .select("reflection_text, created_at")
          .eq("user_id", data.user.id)
          .order("created_at", { ascending: false })
          .limit(5);
        reflectData = alt || [];
      } else {
        reflectData = tryReflection || [];
      }

      setReflections(reflectData);
      setLoading(false);
    };

    fetchData();
  }, [supabase, router]);

  if (loading)
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0e141b] text-[#e6eef4]">
        <p>Loading...</p>
      </main>
    );

  /* 🌐 言語設定 */
  const t = {
    ja: {
      title: "アカウント情報",
      userInfo: "ユーザー情報",
      email: "メールアドレス",
      plan: "プラン",
      credits: "クレジット残高",
      trialEnd: "試用期限",
      reflections: "最近のリフレクト",
      noReflections: "まだリフレクト履歴がありません。",
      goPlans: "プラン・チャージページへ",
      logout: "ログアウト",
    },
    en: {
      title: "Account Overview",
      userInfo: "User Info",
      email: "Email",
      plan: "Plan",
      credits: "Credits",
      trialEnd: "Trial End",
      reflections: "Recent Reflections",
      noReflections: "No reflections yet.",
      goPlans: "Go to Plans / Charge",
      logout: "Logout",
    },
  } as const;

  const text = t[lang];

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1a2230] text-[#e6eef4] px-6 md:px-16 py-24">
      <Header />

      <motion.div
        className="max-w-3xl mx-auto mt-12 border border-[#4c7cf7]/30 rounded-2xl p-8 bg-[#141c26]/50 backdrop-blur-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <h1 className="text-3xl font-bold mb-8 text-center text-[#4c7cf7]">
          {text.title}
        </h1>

        {/* 基本情報 */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-2">{text.userInfo}</h2>
          <p>
            <span className="text-[#a8b3c7]">{text.email}:</span> {user?.email}
          </p>
          <p>
            <span className="text-[#a8b3c7]">{text.plan}:</span>{" "}
            {profile?.plan || "free"}
          </p>
          <p>
            <span className="text-[#a8b3c7]">{text.credits}:</span>{" "}
            {profile?.credit_balance ?? 0}
          </p>
          <p>
            <span className="text-[#a8b3c7]">{text.trialEnd}:</span>{" "}
            {profile?.trial_end || "—"}
          </p>
        </section>

        {/* 最近のリフレクト */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">{text.reflections}</h2>
          {reflections.length > 0 ? (
            <ul className="space-y-2 text-sm text-[#c4d0e2]">
              {reflections.map((r, i) => {
                const textField = r.reflection ?? r.reflection_text ?? "";
                return (
                  <li
                    key={i}
                    className="border border-[#4c7cf7]/20 rounded-lg p-3 bg-[#1b2331]/60"
                  >
                    <p className="text-xs text-[#a8b3c7] mb-1">
                      {new Date(r.created_at).toLocaleString()}
                    </p>
                    <p>{textField.slice(0, 100)}...</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[#a8b3c7] text-sm">{text.noReflections}</p>
          )}
        </section>

        {/* 操作 */}
        <div className="flex flex-col md:flex-row gap-3 justify-center mt-8">
          <Link
            href="/plans"
            className="px-6 py-2 border border-[#4c7cf7] rounded-full text-center hover:bg-[#4c7cf7]/10 transition"
          >
            {text.goPlans}
          </Link>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/auth/login");
            }}
            className="px-6 py-2 border border-red-400 rounded-full text-center hover:bg-red-500/10 transition"
          >
            {text.logout}
          </button>
        </div>
      </motion.div>
    </main>
  );
}
