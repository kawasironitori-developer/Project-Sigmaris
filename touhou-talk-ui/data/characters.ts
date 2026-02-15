import rawCharacters from "./characters.json";

export type CharacterTtsConfig = {
  voice?: string; // "f1" | "f2" | "f3" (AquesTalk1)
  speed?: number; // 50..300
};

export type CharacterDef = {
  id: string;
  name: string;
  title: string;
  world?: {
    map: string; // gensokyo / deep / higan など
    location: string; // scarlet_mansion / chireiden など
  };
  color: {
    accent: string;
  };
  ui: {
    avatar?: string;
    chatBackground: string;
    placeholder: string;
  };
  tts?: CharacterTtsConfig;
};

/**
 * キャラクター定義 (id + world)
 * ================================
 * UI 表示、場所/レイヤー、プロンプト、TTS などの基礎データ。
 */
export const CHARACTERS = rawCharacters as Record<string, CharacterDef>;

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n | 0));
}

export function getCharacterTtsConfig(characterId: string): { voice: string; speed: number } {
  const ch = CHARACTERS[characterId];
  const voice =
    typeof ch?.tts?.voice === "string" && ch.tts.voice.trim() ? ch.tts.voice.trim() : "f1";
  const speedRaw = typeof ch?.tts?.speed === "number" ? ch.tts.speed : 100;
  const speed = clampInt(speedRaw, 50, 300);
  return { voice, speed };
}

/* =========================================================
 * セレクタ
 * ========================================================= */

export function getCharactersByLocation(map: string, locationId: string) {
  return Object.values(CHARACTERS).filter(
    (ch) => ch.world?.map === map && ch.world?.location === locationId,
  );
}

export function canEnableGroupChat(map: string, locationId: string): boolean {
  return getCharactersByLocation(map, locationId).length >= 2;
}

export function getGroupChatCandidates(map: string, locationId: string) {
  return getCharactersByLocation(map, locationId);
}
