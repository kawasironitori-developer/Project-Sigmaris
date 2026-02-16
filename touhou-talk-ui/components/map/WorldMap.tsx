"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { LayerId, MapLocation, DeviceType } from "@/lib/map/locations";
import { CHARACTERS } from "@/data/characters";
import { supabaseBrowser } from "@/lib/supabaseClient";

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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  /* ---------- login check ---------- */

  useEffect(() => {
    let mounted = true;

    supabaseBrowser().auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setIsLoggedIn(Boolean(data.user));
    });

    return () => {
      mounted = false;
    };
  }, []);

  /* ---------- data ---------- */

  const active = useMemo(
    () => locations.find((l) => l.id === activeId) ?? null,
    [activeId, locations]
  );

  const characters = useMemo(
    () => Object.values(CHARACTERS) as Character[],
    []
  );

  /* ---------- 判定系 ---------- */

  const hasCharacterAtLocation = (locationId: string): boolean =>
    characters.some(
      (c) =>
        c.world !== undefined &&
        c.world.map === layer &&
        c.world.location === locationId
    );

  const hasAnyCharacterInLayer = (targetLayer: LayerId): boolean =>
    characters.some(
      (c) => c.world !== undefined && c.world.map === targetLayer
    );

  const charactersHere: Character[] = useMemo(() => {
    if (!active) return [];

    return characters.filter(
      (c) =>
        c.world !== undefined &&
        c.world.map === layer &&
        c.world.location === active.id
    );
  }, [active, layer, characters]);

  /* ========================= */

  const chatBasePath = isLoggedIn ? "/chat/" : "/chat";

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* 背景 */}
      <div className="absolute inset-0">
        <Image
          src={backgroundSrc[device]}
          alt={`${layer} map`}
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/25" />
      </div>

      {/* レイヤー切替 */}
      <div className="absolute top-4 left-4 z-20 flex gap-2">
        {hasAnyCharacterInLayer("gensokyo") && (
          <LayerPill
            href="/map/gensokyo"
            label="幻想郷"
            active={layer === "gensokyo"}
          />
        )}
        {hasAnyCharacterInLayer("deep") && (
          <LayerPill href="/map/deep" label="旧都" active={layer === "deep"} />
        )}
        {hasAnyCharacterInLayer("higan") && (
          <LayerPill
            href="/map/higan"
            label="彼岸"
            active={layer === "higan"}
          />
        )}
      </div>

      {/* マップマーカー */}
      <div className="absolute inset-0 z-10">
        {locations.map((loc) => {
          if (!hasCharacterAtLocation(loc.id)) return null;

          const isActive = activeId === loc.id;
          const pos = loc.pos[device] ?? loc.pos.pc;

          return (
            <button
              key={loc.id}
              type="button"
              onClick={() => setActiveId(loc.id)}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 group"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <span
                className={[
                  "absolute rounded-full",
                  isActive
                    ? "w-12 h-12 border-2 border-cyan-300 shadow-[0_0_18px_rgba(34,211,238,1)]"
                    : "w-10 h-10 border border-sky-300/60 animate-pulse",
                ].join(" ")}
              />
              <span
                className={[
                  "relative rounded-full transition",
                  isActive
                    ? "w-6 h-6 bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,1)]"
                    : "w-4 h-4 bg-sky-200 shadow-[0_0_8px_rgba(125,211,252,0.9)]",
                ].join(" ")}
              />
              <span
                className={[
                  "mt-1 px-3 py-1 rounded-md text-sm whitespace-nowrap backdrop-blur border",
                  isActive
                    ? "bg-cyan-500/25 border-cyan-300/40 text-cyan-200"
                    : "bg-black/60 border-white/10 text-white/85",
                ].join(" ")}
              >
                {loc.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* 場所カード */}
      <div className="absolute bottom-4 right-4 z-30 w-[360px] max-w-[92vw]">
        {active ? (
          <div className="rounded-2xl bg-black/70 backdrop-blur-md border border-white/15 shadow-xl p-5 text-white">
            <div className="text-sm opacity-80">{labelByLayer(layer)}</div>
            <div className="text-xl font-semibold mt-1">{active.name}</div>

            <div className="mt-5">
              <div className="text-sm opacity-80 mb-3">キャラクターを選択</div>

              <div className="grid grid-cols-2 gap-3">
                {charactersHere.map((c) => (
                  <Link
                    key={c.id}
                    href={`${chatBasePath}?layer=${layer}&loc=${active.id}&char=${c.id}`}
                    className="group relative overflow-hidden rounded-xl border border-white/10 backdrop-blur bg-black/40 hover:bg-black/60 transition-all duration-200 hover:scale-[1.03]"
                  >
                    <div className="px-4 py-3 text-center">
                      <div className="text-base font-semibold text-white">
                        {c.name}
                      </div>
                      <div className="mt-1 text-xs text-white/60">
                        話しかける
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setActiveId(null)}
                className="text-sm opacity-70 hover:opacity-100 transition"
              >
                閉じる
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-black/55 backdrop-blur-md border border-white/10 p-4 text-white/80">
            マップ上の地点を選択
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================
 * Sub components
 * ========================= */

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
        "px-3 py-1.5 rounded-full text-sm border transition",
        active
          ? "bg-white/20 border-white/25 text-white"
          : "bg-black/30 border-white/10 text-white/80 hover:bg-black/45 hover:text-white",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

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
