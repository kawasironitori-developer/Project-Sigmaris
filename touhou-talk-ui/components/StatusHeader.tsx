"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CogIcon, LogOutIcon, UserIcon } from "lucide-react";

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

  const md = (user.user_metadata ?? {}) as Record<string, unknown>;
  const avatarUrl = typeof md.avatar_url === "string" ? md.avatar_url : null;
  const displayName =
    (typeof md.full_name === "string" && md.full_name) ||
    (typeof md.name === "string" && md.name) ||
    (typeof md.user_name === "string" && md.user_name) ||
    user.email ||
    "User";

  return (
    <header className="relative z-30 h-12">
      <div className="flex h-full items-center justify-end gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2 text-white/90">
          <Avatar className="size-8 border border-white/20 bg-black/20">
            <AvatarImage src={avatarUrl ?? undefined} alt="User avatar" />
            <AvatarFallback>
              <UserIcon className="size-4" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{displayName}</div>
          </div>
        </div>

        <Button
          asChild
          size="sm"
          variant="secondary"
          className="bg-white/80 text-black hover:bg-white"
        >
          <Link href="/settings">
            <CogIcon className="mr-2 size-4" />
            設定
          </Link>
        </Button>

        <Button
          type="button"
          onClick={logout}
          size="sm"
          variant="secondary"
          className="bg-white/80 text-black hover:bg-white"
        >
          <LogOutIcon className="mr-2 size-4" />
          ログアウト
        </Button>
      </div>
    </header>
  );
}
