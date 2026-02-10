"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

export default function StatusHeader() {
  const router = useRouter();
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

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (!authChecked) return null;
  if (!user) return null;

  return (
    <header className="relative z-30 h-12">
      <div className="flex h-full items-center justify-end gap-3 px-4 text-sm">
        <span className="text-white/80">{user.email}</span>
        <button
          onClick={logout}
          className="rounded-md bg-white/80 px-3 py-1 text-black backdrop-blur hover:bg-white"
        >
          ログアウト
        </button>
      </div>
    </header>
  );
}
