"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  applyThemeClass,
  getSkipMapOnStart,
  getTheme,
  setSkipMapOnStart,
  setTheme,
  type TouhouTheme,
} from "@/lib/touhou-settings";

export default function SettingsPage() {
  const [skipMap, setSkipMap] = useState(false);
  const [theme, setThemeState] = useState<TouhouTheme>("dark");

  useEffect(() => {
    setSkipMap(getSkipMapOnStart());
    setThemeState(getTheme());
  }, []);

  const updateTheme = (t: TouhouTheme) => {
    setThemeState(t);
    setTheme(t);
    applyThemeClass(t);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-gensou text-2xl">設定</h1>
          <p className="text-muted-foreground text-sm">
            起動動作とテーマを変更します
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/chat/session">チャットへ戻る</Link>
        </Button>
      </div>

      <Separator />

      <section className="rounded-2xl border bg-card/60 p-5">
        <h2 className="font-medium">起動</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Touhou Talk を開いたときの遷移を設定します。
        </p>

        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <div className="font-medium text-sm">マップをスキップ</div>
            <div className="text-muted-foreground text-xs">
              マップ画面を飛ばしてチャット画面へ直行
            </div>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={skipMap}
              onChange={(e) => {
                const v = e.currentTarget.checked;
                setSkipMap(v);
                setSkipMapOnStart(v);
              }}
              className="size-4"
            />
            {skipMap ? "ON" : "OFF"}
          </label>
        </div>
      </section>

      <section className="rounded-2xl border bg-card/60 p-5">
        <h2 className="font-medium">テーマ</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          `touhou-test-ui` のテーマに加えて、柔らかいテーマを追加しています。
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ThemeButton
            label="Light"
            active={theme === "light"}
            onClick={() => updateTheme("light")}
          />
          <ThemeButton
            label="Dark"
            active={theme === "dark"}
            onClick={() => updateTheme("dark")}
          />
          <ThemeButton
            label="Sigmaris"
            active={theme === "sigmaris"}
            onClick={() => updateTheme("sigmaris")}
          />
          <ThemeButton
            label="Soft"
            active={theme === "soft"}
            onClick={() => updateTheme("soft")}
          />
        </div>
      </section>
    </div>
  );
}

function ThemeButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-xl border px-4 py-3 text-left transition",
        active
          ? "border-ring bg-accent/70"
          : "border-border hover:bg-accent/40",
      ].join(" ")}
    >
      <div className="font-medium text-sm">{label}</div>
      <div className="text-muted-foreground text-xs">
        {active ? "選択中" : " "}
      </div>
    </button>
  );
}

