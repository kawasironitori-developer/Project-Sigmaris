"use client";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function LoginPage() {
  const supabase = createClientComponentClient();

  async function handleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback`,
      },
    });
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-xl mb-4">ログインしてください</h1>
      <button
        onClick={handleLogin}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Googleでログイン
      </button>
    </div>
  );
}
