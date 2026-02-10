"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { LayerId, MapLocation, DeviceType } from "@/lib/map/locations";
import { CHARACTERS } from "@/data/characters";

/* =========================
 * Types
 * ========================= */

type Character = {
  id: string;
  name: string;
  world?: {
    map: LayerId;
    location: string;
  };
};

type BackgroundSrc = {
  sp: string;
  tablet: string;
  pc: string;
};

type Props = {
  layer: LayerId;
  backgroundSrc: BackgroundSrc;
  locations: MapLocation[];
};

/* =========================
 * Device hook
 * ========================= */

function useDevice(): DeviceType {
  const [device, setDevice] = useState<DeviceType>("pc");

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w <= 640) setDevice("sp");
      else if (w <= 1024) setDevice("tablet");
      else setDevice("pc");
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return device;
}

/* =========================
 * Component
 * ========================= */

export default function WorldMap({ layer, backgroundSrc, locations }: Props) {
  const device = useDevice();
  const router = useRouter();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingChar, setLoadingChar] = useState<string | null>(null);

  /* ---------- data ---------- */

  const active = useMemo(
    () => locations.find((l) => l.id === activeId) ?? null,
    [activeId, locations],
  );

  const characters = useMemo(
    () => Object.values(CHARACTERS) as Character[],
    [],
  );

  const hasCharacterAtLocation = (locationId: string): boolean =>
    characters.some((c) => c.world?.map === layer && c.world.location === locationId);

  const hasAnyCharacterInLayer = (targetLayer: LayerId): boolean =>
    characters.some((c) => c.world?.map === targetLayer);

  const charactersHere = useMemo(() => {
    if (!active) return [];
    return characters.filter(
      (c) => c.world && c.world.map === layer && c.world.location === active.id,
    );
  }, [active, characters, layer]);

  /* =========================
   * キャラ選択 → チャット画面へ遷移のみ
   * （セッション作成・解決は ChatClient 側）
   * ========================= */

  const openCharacterChat = (char: Character) => {
    setLoadingChar(char.id);

    const params = new URLSearchParams();
    params.set("layer", layer);
    if (active?.id) params.set("loc", active.id);
    params.set("char", char.id);

    router.push(`/chat/session?${params.toString()}`);
  };

  /* ========================= */

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* 背景 */}
      <Image
        src={backgroundSrc[device]}
        alt={`${layer} map`}
        fill
        priority
        className="object-cover"
      />
      <div className="absolute inset-0 bg-black/25" />

      {/* Layer switch */}
      <div className="absolute left-4 top-4 z-30 flex gap-2">
        {hasAnyCharacterInLayer("gensokyo") && (
          <LayerPill
            href="/map/session/gensokyo"
            label="幻想郷"
            active={layer === "gensokyo"}
          />
        )}
        {hasAnyCharacterInLayer("deep") && (
          <LayerPill href="/map/session/deep" label="深層" active={layer === "deep"} />
        )}
        {hasAnyCharacterInLayer("higan") && (
          <LayerPill href="/map/session/higan" label="彼岸" active={layer === "higan"} />
        )}
      </div>

      {/* マップ */}
      <div className="absolute inset-0 z-10">
        {locations.map((loc) => {
          const pos = loc.pos[device] ?? loc.pos.pc;
          if (!hasCharacterAtLocation(loc.id)) return null;

          return (
            <button
              key={loc.id}
              onClick={() => setActiveId(loc.id)}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <span className="block h-4 w-4 animate-pulse rounded-full bg-cyan-300" />
              <span className="mt-1 block rounded bg-black/60 px-3 py-1 text-sm text-white">
                {loc.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* キャラ選択 */}
      <div className="absolute bottom-4 right-4 z-20 w-[360px] max-w-[92vw]">
        {active ? (
          <div className="rounded-2xl border border-white/15 bg-black/70 p-5 text-white backdrop-blur">
            <div className="text-sm opacity-70">{labelByLayer(layer)}</div>
            <div className="mt-1 text-xl font-semibold">{active.name}</div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {charactersHere.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openCharacterChat(c)}
                  disabled={loadingChar === c.id}
                  className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 transition hover:bg-black/60"
                >
                  <div className="font-semibold">{c.name}</div>
                  <div className="mt-1 text-xs opacity-70">
                    {loadingChar === c.id ? "移動中…" : "話しかける"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-black/60 p-4 text-white/70">
            マップ上の地点を選択
          </div>
        )}
      </div>
    </div>
  );
}

/* ========================= */

function labelByLayer(layer: LayerId) {
  switch (layer) {
    case "gensokyo":
      return "Layer1：幻想郷";
    case "deep":
      return "Layer2：深層";
    case "higan":
      return "Layer3：彼岸";
  }
}

function LayerPill({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "rounded-full border px-3 py-1.5 text-sm transition",
        active
          ? "border-white/25 bg-white/20 text-white"
          : "border-white/10 bg-black/30 text-white/80 hover:bg-black/45 hover:text-white",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}
