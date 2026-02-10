// lib/chat/groupContext.ts
//
// ✅ Group Chat の「核」になる中立ロジック。
// - UI / API / LLM から独立した純データ層
// - 「場（GroupDef）」を唯一の正規入力とする
//

import type { GroupDef } from "@/data/group";
import { getGroupById, getGroupsByLocation } from "@/data/group";

/* =========================
   Types
========================= */

/**
 * チャットログの最小構造
 * - 単体 / グループ両対応
 */
export type ChatMessage = {
  id: string;
  role: "user" | "ai";
  content: string;

  /** グループチャット時：誰の発言か */
  speakerId?: string;
};

/**
 * グループチャットの「場」コンテキスト
 *
 * 👉 UI / Chat / API すべてがこれを参照する
 */
export type GroupContext = {
  /** 有効かどうか */
  enabled: boolean;

  /** 表示用ラベル */
  label: string;

  /** 正規のグループ定義（SSOT） */
  group: GroupDef;

  /** グループチャットの履歴 */
  history: ChatMessage[];

  /** 現在の話者（未開始時は null） */
  currentSpeakerId: string | null;
};

/* =========================
   Builders
========================= */

/**
 * location から GroupContext を構築（未開始状態）
 *
 * - 対応する GroupDef が存在しない場合は null
 * - participants 数は GroupDef 側で保証される
 */
export function buildGroupContext(args: {
  layer: string;
  locationId: string;
  history?: ChatMessage[];
}): GroupContext | null {
  const { layer, locationId } = args;

  const groups = getGroupsByLocation(layer, locationId);
  if (groups.length === 0) return null;

  // 現時点では「1ロケーション = 1グループ」前提
  const group = groups[0];

  return {
    enabled: group.participants.length >= 1,
    label: group.world.location,
    group,
    history: args.history ?? [],
    currentSpeakerId: null,
  };
}

/* =========================
   Group start utilities
========================= */

/**
 * ランダムに話者を 1 人選ぶ
 */
export function pickRandomSpeakerId(group: GroupDef): string | null {
  if (group.participants.length === 0) return null;

  const index = Math.floor(Math.random() * group.participants.length);
  return group.participants[index];
}

/**
 * グループチャット開始処理
 *
 * - 最初の話者を決定
 * - 初期メッセージを生成
 */
export function initializeGroupContext(ctx: GroupContext): GroupContext {
  if (!ctx.enabled) return ctx;
  if (ctx.currentSpeakerId) return ctx;

  const speakerId = pickRandomSpeakerId(ctx.group);
  if (!speakerId) return ctx;

  const initMessage: ChatMessage = {
    id: "init",
    role: "ai",
    speakerId,
    content: `……場の空気が、静かに動き出した。`,
  };

  return {
    ...ctx,
    currentSpeakerId: speakerId,
    history: ctx.history.length === 0 ? [initMessage] : ctx.history,
  };
}

/* =========================
   Utilities
========================= */

/**
 * 参加者 ID 一覧
 */
export function getParticipantIds(ctx: GroupContext): string[] {
  return ctx.group.participants;
}
