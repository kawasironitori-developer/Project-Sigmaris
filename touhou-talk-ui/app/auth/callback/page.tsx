// app/auth/callback/page.tsx

"use client";

export const dynamic = "force-dynamic";

import React from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const sp = new URL(window.location.href).searchParams;
        const oauthError =
          sp.get("error_description") || sp.get("error") || sp.get("error_code");
        if (oauthError) {
          setError(String(oauthError));
          return;
        }

        // Google OAuth (PKCE) returns `?code=...`.
        const code = sp.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setError(error.message);
            return;
          }
        }

        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;

        if (error || !data.session) {
          setError("ログインに失敗しました。もう一度お試しください。");
          return;
        }

        router.replace("/map/session/gensokyo");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg || "ログインに失敗しました。");
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-black text-white">
      {error ? (
        <div className="text-sm text-red-400">{error}</div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
          <p className="text-sm text-white/70">ログイン処理中…</p>
        </div>
      )}
    </div>
  );
}
