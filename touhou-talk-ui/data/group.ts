// data/groups.ts
//
// グループ（＝会話の「場」）定義
// ===============================
//
// ・キャラクターとは別概念
// ・人格を持たない
// ・「誰が参加可能か」「どこに存在するか」だけを定義
//
// UI / Chat / LLM すべてはこの定義を元に派生させる
// （ここ自体は純データ層）
//

import rawGroups from "./group.json";

/* =========================
   Types
========================= */

/**
 * グループ定義
 *
 * 注意：
 * - chatBackground / placeholder は持たない
 * - 話者の決定ロジックは groupContext 側で行う
 */
export type GroupDef = {
  /** 一意ID（group_xxx） */
  id: string;

  /** 種別固定（判定用） */
  type: "group";

  /** 表示名 */
  name: string;

  /** サブタイトル（任意） */
  title?: string;

  /** 世界・ロケーション */
  world: {
    map: string; // gensokyo / deep / higan など
    location: string; // scarlet_mansion / chireiden など
  };

  /**
   * 参加キャラID一覧
   * - CHARACTERS 側に存在する ID のみを書く
   * - 未実装キャラは書かない（= 自然に除外される）
   */
  participants: string[];

  /** UI用メタ情報 */
  ui: {
    label: string;
    icon?: string;
    accent?: string;
  };
};

/* =========================
   SSOT
========================= */

/**
 * グループ定義一覧（Single Source of Truth）
 *
 * ※ CHARACTERS とは混ぜない
 * ※ キャラと同列に扱わない
 */
export const GROUPS = rawGroups as Record<string, GroupDef>;

/* =========================================================
 * 以下は「派生セレクタ」
 * 👉 データは増やさず、見方だけを定義する
 * ========================================================= */

/**
 * 指定されたロケーションに存在するグループ一覧を返す
 */
export function getGroupsByLocation(
  map: string,
  locationId: string
): GroupDef[] {
  return Object.values(GROUPS).filter(
    (g) => g.world.map === map && g.world.location === locationId
  );
}

/**
 * 指定グループの参加キャラID一覧を返す
 *
 * - 順序は groups.json に書かれた順
 * - 話者選定・UI表示順の seed に使える
 */
export function getGroupParticipantIds(groupId: string): string[] {
  const group = GROUPS[groupId];
  if (!group) return [];
  return group.participants;
}

/**
 * グループが有効かどうか
 *
 * - 参加者が2人以上いれば true
 * - UI 側で「グループチャット開始可否」に使用
 */
export function canEnableGroup(groupId: string): boolean {
  const group = GROUPS[groupId];
  if (!group) return false;
  return group.participants.length >= 2;
}

/**
 * グループを ID から取得（安全版）
 */
export function getGroupById(groupId: string): GroupDef | null {
  return GROUPS[groupId] ?? null;
}
