"use client";

import { useMemo } from "react";

type PublicConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  desktopEnvPath?: string;
  desktopUserDataDir?: string;
};

function readPublicConfig(): PublicConfig {
  if (typeof window === "undefined") return {};
  const g = window as any;
  const cfg = g.__TOUHOU_PUBLIC;
  if (!cfg || typeof cfg !== "object") return {};
  return cfg as PublicConfig;
}

export function EnvGuard({ children }: { children: React.ReactNode }) {
  const cfg = useMemo(() => readPublicConfig(), []);

  const urlOk = typeof cfg.supabaseUrl === "string" && cfg.supabaseUrl.trim() !== "";
  const anonOk =
    typeof cfg.supabaseAnonKey === "string" && cfg.supabaseAnonKey.trim() !== "";
  const ok = urlOk && anonOk;

  if (ok) return <>{children}</>;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-10">
        <h1 className="text-xl font-semibold">初期設定が必要です</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Supabase の設定が見つからないため起動できません。
        </p>

        <div className="mt-6 rounded-xl border bg-card p-4 text-sm">
          <div className="font-medium">設定ファイル</div>
          <div className="mt-2 font-mono text-xs text-muted-foreground">
            {cfg.desktopEnvPath?.trim()
              ? cfg.desktopEnvPath
              : "%APPDATA%\\Touhou Talk\\touhou-talk.env"}
          </div>
          {cfg.desktopUserDataDir?.trim() ? (
            <div className="mt-3 text-xs text-muted-foreground">
              userData: <span className="font-mono">{cfg.desktopUserDataDir}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-4 rounded-xl border bg-card p-4 text-sm">
          <div className="font-medium">最低限必要な項目</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>NEXT_PUBLIC_SUPABASE_URL</li>
            <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
          </ul>

          <div className="mt-3 text-xs text-muted-foreground">
            読み込み状況: URL={urlOk ? "OK" : "MISSING"} / ANON={anonOk ? "OK" : "MISSING"}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            入力後にアプリを再起動してください。
          </p>
        </div>
      </div>
    </div>
  );
}

