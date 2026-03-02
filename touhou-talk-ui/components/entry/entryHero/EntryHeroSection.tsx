"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import style from "@/components/entry/entryHero/EntryHeroSection.module.scss";

import {
  CHARACTERS,
  isCharacterSelectable,
  type CharacterDef,
} from "@/data/characters";
import { setLastSelectedChatNext } from "@/components/entry/EntrySelectionTracker";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-secondary px-3 py-1 text-[11px] font-medium text-secondary-foreground">
      {children}
    </span>
  );
}

function buildNextPathForCharacterId(characterId: string) {
  const ch = CHARACTERS[characterId];
  const layer = typeof ch?.world?.map === "string" ? ch.world.map : "";
  const loc = typeof ch?.world?.location === "string" ? ch.world.location : "";
  const sp = new URLSearchParams();
  sp.set("char", characterId);
  if (layer) sp.set("layer", layer);
  if (loc) sp.set("loc", loc);
  return `/chat/session?${sp.toString()}`;
}

function HeroCharacterButton({
  characterId,
  label,
  verb = "話す",
  className,
  showAvatar = false,
}: {
  characterId: string;
  label: string;
  verb?: string;
  className?: string;
  showAvatar?: boolean;
}) {
  const ch: CharacterDef | undefined = CHARACTERS[characterId];
  const selectable = isCharacterSelectable(ch);
  const nextPath = buildNextPathForCharacterId(characterId);
  const href = `/auth/login?next=${encodeURIComponent(nextPath)}`;
  const avatarSrc = typeof ch?.ui?.avatar === "string" ? ch.ui.avatar : "";

  const content = (
    <span className="flex w-full items-center justify-center gap-2">
      {showAvatar && avatarSrc ? (
        <span className="relative h-7 w-7 overflow-hidden rounded-full border border-border bg-secondary shadow-sm">
          <Image src={avatarSrc} alt="" fill className="object-cover" />
        </span>
      ) : null}
      <span className="text-center leading-tight">
        {label}と{verb}
      </span>
    </span>
  );

  return selectable ? (
    <Link
      href={href}
      onClick={() => setLastSelectedChatNext(nextPath)}
      className={`inline-flex w-full items-center justify-center ${
        className ??
        "rounded-xl border border-border bg-card/90 px-4 py-3 text-sm font-medium text-foreground shadow-sm backdrop-blur hover:bg-card"
      }`}
    >
      {content}
    </Link>
  ) : (
    <div
      className={`inline-flex w-full items-center justify-center ${
        className ??
        "rounded-xl border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground"
      }`}
    >
      <span className="flex w-full items-center justify-center gap-2">
        {showAvatar && avatarSrc ? (
          <span className="relative h-7 w-7 overflow-hidden rounded-full border border-border bg-secondary">
            <Image
              src={avatarSrc}
              alt=""
              fill
              className="object-cover opacity-60"
            />
          </span>
        ) : null}
        <span className="whitespace-nowrap">{label}（準備中）</span>
      </span>
    </div>
  );
}

export default function EntryHeroSection() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(true);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    
      <section
        id="entry-hero"
        data-entry-section="hero"
        className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-3xl bg-transparent"
      >
        <div className="relative aspect-[3/2] w-full">
          {/*imageのスペース*/}
        </div>
        <div
          className={`absolute inset-0 fixed ${style.page} ${visible ? style["page--visible"] : ""} top-0 aspect-[3/2] lg:w-full lg:max-w-6xl`}
        >
          <div className="absolute inset-0 grid grid-cols-3">
            <div className="relative h-full w-full overflow-hidden">
          <Image
            src="/entry/hero.png"
            alt="魔理沙・霊夢・アリス"
            fill
            priority
            sizes="(max-width: 1024px) 33vw, 33vw"
            className="object-cover object-left"
          />

            </div>
            <div className="relative h-full w-full overflow-hidden">
              <Image
                src="/entry/hero.png"
                alt=""
                fill
                priority
                sizes="(max-width: 1024px) 33vw, 33vw"
                className="object-cover object-center"
              />
            </div>
            <div className="relative h-full w-full overflow-hidden">
              <Image
                src="/entry/hero.png"
                alt=""
                fill
                priority
                sizes="(max-width: 1024px) 33vw, 33vw"
                className="object-cover object-right"
              />
            </div>
          </div>

          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 sm:px-10">
            <div className="mx-auto grid w-full grid-cols-3 gap-2 sm:grid-cols-[1fr_minmax(0,14rem)_1fr_minmax(0,14rem)_1fr_minmax(0,14rem)_1fr] sm:gap-0">
              <HeroCharacterButton
                characterId="marisa"
                label="魔理沙"
                verb="対話する"
                showAvatar
                className="w-full rounded-2xl border border-border bg-card/80 px-3 py-4 text-[12px] font-semibold text-card-foreground shadow-lg shadow-black/20 backdrop-blur hover:bg-card active:bg-card/90 sm:col-start-2 sm:px-4 sm:text-sm"
              />
              <HeroCharacterButton
                characterId="reimu"
                label="霊夢"
                verb="対話する"
                showAvatar
                className="w-full rounded-2xl border border-border bg-card/80 px-3 py-4 text-[12px] font-semibold text-card-foreground shadow-lg shadow-black/20 backdrop-blur hover:bg-card active:bg-card/90 sm:col-start-4 sm:px-4 sm:text-sm"
              />
              <HeroCharacterButton
                characterId="alice"
                label="アリス"
                verb="対話する"
                showAvatar
                className="w-full rounded-2xl border border-border bg-card/80 px-3 py-4 text-[12px] font-semibold text-card-foreground shadow-lg shadow-black/20 backdrop-blur hover:bg-card active:bg-card/90 sm:col-start-6 sm:px-4 sm:text-sm"
              />
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
            <div className="hidden rounded-2xl border border-border bg-card/85 p-5 shadow-sm lg:block">
              <div className="text-xs font-medium text-muted-foreground">
                Touhou Talk
              </div>
              <h1 className="mt-2 font-gensou text-2xl tracking-wide sm:text-3xl">
                東方キャラと“ちゃんと会話できる”体験。
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                キャラクターを選択し、ログイン後すぐに会話を開始できます。
              </p>

            </div>
          </div>
        </div>

        {/* SP/Tablet: move the text card under the hero image (no overlap) */}
        <div className="lg:mt-4 -mt-4 px-4 sm:px-6 lg:hidden">
          <div className="rounded-2xl border border-border bg-card/90 p-5 shadow-sm">
            <div className="text-xs font-medium text-muted-foreground">
              Touhou Talk
            </div>
            <h1 className="mt-2 font-gensou text-2xl tracking-wide">
              東方キャラと“ちゃんと会話できる”体験。
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              キャラクターを選択し、ログイン後すぐに会話を開始できます。
            </p>
          </div>
        </div>
      </section>
  );
}
