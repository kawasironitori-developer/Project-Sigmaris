import rawCharacters from "./characters.json";

export type CharacterDef = {
  id: string;
  name: string;
  title: string;
  promptVersion?: string;
  enabled?: boolean; // true(default) / false(貅門ｙ荳ｭ: UI縺ｧ驕ｸ謚樔ｸ榊庄)
  world?: {
    map: string; // gensokyo / deep / higan 縺ｪ縺ｩ
    location: string; // scarlet_mansion / chireiden 縺ｪ縺ｩ
  };
  color: {
    accent: string;
  };
  ui: {
    avatar?: string;
    /** Backward-compatible fallback. Prefer chatBackgroundPC/SP in UI. */
    chatBackground?: string;
    chatBackgroundPC?: string;
    chatBackgroundSP?: string;
    placeholder: string;
  };
};

/**
 * 繧ｭ繝｣繝ｩ繧ｯ繧ｿ繝ｼ螳夂ｾｩ (id + world)
 * ================================
 * UI 陦ｨ遉ｺ縲∝ｴ謇/繝ｬ繧､繝､繝ｼ縲√・繝ｭ繝ｳ繝励ヨ縲ゝTS 縺ｪ縺ｩ縺ｮ蝓ｺ遉弱ョ繝ｼ繧ｿ縲・ */
export const CHARACTERS = rawCharacters as Record<string, CharacterDef>;

export function isCharacterEnabled(ch: CharacterDef | null | undefined): boolean {
  if (!ch) return false;
  return ch.enabled !== false;
}

export function hasCharacterAvatar(ch: CharacterDef | null | undefined): boolean {
  const a = ch?.ui?.avatar;
  return typeof a === "string" && a.trim().length > 0;
}

export function isCharacterSelectable(ch: CharacterDef | null | undefined): boolean {
  return isCharacterEnabled(ch) && hasCharacterAvatar(ch);
}

/* =========================================================
 * 繧ｻ繝ｬ繧ｯ繧ｿ
 * ========================================================= */

export function getCharactersByLocation(map: string, locationId: string) {
  return Object.values(CHARACTERS).filter(
    (ch) =>
      isCharacterSelectable(ch) &&
      ch.world?.map === map &&
      ch.world?.location === locationId,
  );
}

export function canEnableGroupChat(map: string, locationId: string): boolean {
  return getCharactersByLocation(map, locationId).length >= 2;
}

export function getGroupChatCandidates(map: string, locationId: string) {
  return getCharactersByLocation(map, locationId);
}
