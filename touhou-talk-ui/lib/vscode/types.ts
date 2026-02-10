// lib/vscode/types.ts
// =====================================================
// VS Code 作業モード 共通型定義（UI / Extension 共通思想）
//
// - FastAPI (core.vscode.types) と 1:1 対応
// - UI 側では「表示・状態同期」用途のみ
// - 実ファイル操作の責務は含めない
// =====================================================

/* =========================
   Work Mode
========================= */

/**
 * 作業状態。
 * FastAPI 側 WorkMode と完全一致させること。
 */
export type WorkMode =
  | "read" // 読み取りのみ
  | "plan" // 作業計画生成済み
  | "diff" // 差分生成済み
  | "apply"; // 承認済み（適用可能）

/* =========================
   Target File
========================= */

/**
 * 作業対象ファイル。
 * language は将来の diff/highlight 用。
 */
export type TargetFile = {
  path: string;
  language?: string;
};

/* =========================
   Work Plan
========================= */

/**
 * AI が生成する作業計画。
 * - 「何をするか」
 * - 「どのファイルに影響するか」
 */
export type WorkPlan = {
  plan_id: string;
  summary: string;
  affected_files: TargetFile[];
};

/* =========================
   Diff
========================= */

/**
 * 単一ファイルの差分。
 * diff は unified diff 形式（文字列）を想定。
 *
 * 注意：
 * - VS Code Extension 側の diffApplier.ts が要求する
 *   「operations/chunk」形式とは別物。
 * - その形式にするなら FastAPI 側の FileDiff を変えるか、
 *   Extension 側で変換レイヤを挟むこと。
 */
export type FileDiff = {
  path: string;
  diff: string;
};

/**
 * 作業計画に紐づく差分集合。
 * UI は表示のために参照する。
 */
export type DiffSet = {
  plan_id: string;
  diffs: FileDiff[];
};

/* =========================
   Session State
========================= */

/**
 * Work セッションの現在状態。
 * UI はこれを信用して描画する。
 *
 * 注意：
 * FastAPI 側の state 返却方針が
 * - current_mode を返すのか
 * - state というキーで返すのか
 * が揺れると UI 側が死ぬので、ここを正にして合わせる。
 */
export type WorkSessionState = {
  session_id: string;
  current_mode: WorkMode;

  target_files: TargetFile[];

  plan?: WorkPlan;
  diff?: DiffSet;
};

/* =========================
   API Responses
========================= */

/**
 * /vscode/session/start
 */
export type StartSessionResponse = {
  session_id: string;
  state: WorkMode;
};

/**
 * /vscode/session/end
 */
export type EndSessionResponse = {
  status: "ended";
};

/**
 * /vscode/files
 *
 * FastAPI 実装は { files, state } を返しているのでそれに合わせる。
 */
export type SetFilesResponse = {
  files: string[];
  state: WorkMode;
};

/**
 * /vscode/plan
 */
export type GeneratePlanResponse = {
  plan: WorkPlan;
  state: WorkMode;
};

/**
 * /vscode/diff
 *
 * FastAPI は diff_set(DiffSet) を返している（{ diffs: diff_set }）ので、
 * UI 側も「DiffSet を受け取る」前提に統一する。
 */
export type GenerateDiffResponse = {
  diffs: DiffSet;
  state: WorkMode;
};

/**
 * /vscode/permission/approve
 * /vscode/permission/reject
 */
export type PermissionResponse = {
  state: WorkMode;
};

/**
 * /vscode/commit
 *
 * FastAPI 実装は session.diffs を返す。
 * それが DiffSet なら DiffSet、FileDiff[] なら FileDiff[] で揺れる。
 * ここでは「DiffSet を正」として固定する（state を正とする方針と同じ）。
 */
export type CommitResponse = {
  status: "committed";
  diffs: DiffSet;
};

/* =========================
   Utility Guards
========================= */

/**
 * Apply 状態かどうか。
 * UI / Extension 共通。
 */
export function isApplyMode(mode: WorkMode): boolean {
  return mode === "apply";
}

/**
 * Diff が存在するか。
 */
export function hasDiff(state: WorkSessionState): boolean {
  return !!state.diff && state.diff.diffs.length > 0;
}

/**
 * Mode が正しい文字列か（外部入力ガード）。
 */
export function isWorkMode(value: unknown): value is WorkMode {
  return (
    value === "read" ||
    value === "plan" ||
    value === "diff" ||
    value === "apply"
  );
}
