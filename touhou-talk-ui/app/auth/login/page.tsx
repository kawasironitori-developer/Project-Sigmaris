"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import TopShell from "@/components/top/TopShell";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          prompt: "select_account",
          access_type: "offline",
          response_type: "code",
        },
      },
    });

    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <TopShell>
      <div className="w-full max-w-sm rounded-xl bg-white/10 p-6 backdrop-blur text-white">
        <h1 className="mb-4 text-lg font-medium">ログイン</h1>

        <p className="mb-4 text-sm text-white/80">
          Sigmaris（`sigmaris-os`）と同じく、Supabase Auth の Google ログインを使います。
        </p>

        {error && <p className="mb-2 text-sm text-red-400">{error}</p>}

        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="w-full rounded-lg bg-white px-4 py-2 text-sm text-black disabled:opacity-50"
        >
          {loading ? "リダイレクト中…" : "Googleでログイン"}
        </button>

        <button
          onClick={() => router.push("/")}
          className="mt-4 text-xs text-white/60 hover:text-white"
        >
          戻る
        </button>
      </div>
    </TopShell>
  );
}

