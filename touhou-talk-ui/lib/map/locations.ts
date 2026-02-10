// lib/map/locations.ts

/* =========================
 * World / Layer definition
 * ========================= */

export type LayerId = "gensokyo" | "deep" | "higan";

/* =========================
 * Device definition
 * ========================= */

export type DeviceType = "sp" | "tablet" | "pc";

/* =========================
 * Position definition
 * ========================= */

export type Position = {
  x: number;
  y: number;
};

export type DevicePosition = {
  pc: Position;
  tablet?: Position;
  sp?: Position;
};

/* =========================
 * Location definition
 * =========================
 * ※ キャラ概念は一旦持たない
 * ※ pos はデバイス別指定を前提
 */

export type MapLocation = {
  id: string;
  layer: LayerId;
  name: string; // UIカード専用（マップ上に文字は出さない）
  pos: DevicePosition; // 0..100 (%)
  hitRadius: number;
};

/* =========================
 * Backgrounds
 * ========================= */

export const MAP_BACKGROUNDS: Record<LayerId, Record<DeviceType, string>> = {
  gensokyo: {
    sp: "/maps/gensokyo-sp.png",
    tablet: "/maps/gensokyo-sp.png",
    pc: "/maps/gensokyo-pc.png",
  },
  deep: {
    sp: "/maps/deep-sp.png",
    tablet: "/maps/deep-sp.png",
    pc: "/maps/deep-pc.png",
  },
  higan: {
    sp: "/maps/higan-sp.png",
    tablet: "/maps/higan-sp.png",
    pc: "/maps/higan-pc.png",
  },
};

/* =========================
 * World data (Single Source of Truth)
 * ========================= */

export const LOCATIONS: readonly MapLocation[] = [
  // ===== Layer1: 幻想郷 =====
  {
    id: "hakurei_shrine",
    layer: "gensokyo",
    name: "博麗神社",
    pos: {
      pc: { x: 30, y: 20 },
      tablet: { x: 16, y: 30 },
      sp: { x: 10, y: 38 },
    },
    hitRadius: 3.2,
  },
  {
    id: "moriya_shrine",
    layer: "gensokyo",
    name: "守矢神社",
    pos: {
      pc: { x: 55, y: 22 },
      tablet: { x: 55, y: 22 },
      sp: { x: 55, y: 22 },
    },
    hitRadius: 3.2,
  },
  {
    id: "human_village",
    layer: "gensokyo",
    name: "人里",
    pos: {
      pc: { x: 46, y: 55 },
      tablet: { x: 46, y: 55 },
      sp: { x: 46, y: 55 },
    },
    hitRadius: 4.0,
  },
  {
    id: "forest_of_magic",
    layer: "gensokyo",
    name: "魔法の森",
    pos: {
      pc: { x: 28, y: 64 },
      tablet: { x: 15, y: 70 },
      sp: { x:12, y: 64 },
    },
    hitRadius: 4.0,
  },
  {
    id: "youkai_mountain",
    layer: "gensokyo",
    name: "妖怪の山",
    pos: {
      pc: { x: 45, y: 10 },
      tablet: { x: 30, y: 10 },
      sp: { x: 25, y: 25 },
    },
    hitRadius: 4.0,
  },
  {
    id: "scarlet_mansion",
    layer: "gensokyo",
    name: "紅魔館",
    pos: {
      pc: { x: 78, y: 16 },
      tablet: { x: 78, y: 25 },
      sp: { x: 78, y: 35 },
    },
    hitRadius: 3.8,
  },
  {
    id: "bamboo_forest",
    layer: "gensokyo",
    name: "迷いの竹林",
    pos: {
      pc: { x: 72, y: 72 },
      tablet: { x: 72, y: 72 },
      sp: { x: 72, y: 72 },
    },
    hitRadius: 4.2,
  },
  {
    id: "eientei",
    layer: "gensokyo",
    name: "永遠亭",
    pos: {
      pc: { x: 83, y: 78 },
      tablet: { x: 83, y: 78 },
      sp: { x: 83, y: 78 },
    },
    hitRadius: 3.2,
  },

  // ===== Layer2: 深層 =====
  {
    id: "old_capital",
    layer: "deep",
    name: "旧都（旧市街地）",
    pos: {
      pc: { x: 70, y: 55 },
      tablet: { x: 70, y: 55 },
      sp: { x: 70, y: 55 },
    },
    hitRadius: 4.2,
  },
  {
    id: "mansion_and_bridge",
    layer: "deep",
    name: "洋風の屋敷（橋で旧都へ）",
    pos: {
      pc: { x: 30, y: 38 },
      tablet: { x: 30, y: 38 },
      sp: { x: 30, y: 38 },
    },
    hitRadius: 4.0,
  },
  {
    id: "chireiden",
    layer: "deep",
    name: "地霊殿",
    pos: {
      pc: { x: 28, y: 42 },
      tablet: { x: 28, y: 30 },
      sp: { x: 28, y: 35 },
    },
    hitRadius: 4.5,
  },
  {
    id: "chireiden_entrance",
    layer: "deep",
    name: "地霊殿への穴",
    pos: {
      pc: { x: 50, y: 80 },
      tablet: { x: 50, y: 80 },
      sp: { x: 50, y: 80 },
    },
    hitRadius: 4.2,
  },

  // ===== Layer3: 彼岸 =====
  {
    id: "sanzu_river",
    layer: "higan",
    name: "三途の川",
    pos: {
      pc: { x: 40, y: 62 },
      tablet: { x: 40, y: 62 },
      sp: { x: 40, y: 62 },
    },
    hitRadius: 4.4,
  },
  {
    id: "hakugyokurou",
    layer: "higan",
    name: "白玉楼",
    pos: {
      pc: { x: 35, y: 30 },
      tablet: { x: 40, y: 20 },
      sp: { x: 35, y: 30 },
    },
    hitRadius: 4.0,
  },
  {
    id: "shikieiki_office",
    layer: "higan",
    name: "是非曲直庁",
    pos: {
      pc: { x: 72, y: 42 },
      tablet: { x: 72, y: 42 },
      sp: { x: 72, y: 42 },
    },
    hitRadius: 4.0,
  },
] as const;

/* =========================
 * Selectors
 * ========================= */

export function getLocationsByLayer(layer: LayerId): MapLocation[] {
  return LOCATIONS.filter((l) => l.layer === layer);
}

export function findLocation(
  layer: LayerId,
  locationId: string
): MapLocation | undefined {
  return LOCATIONS.find((l) => l.layer === layer && l.id === locationId);
}
