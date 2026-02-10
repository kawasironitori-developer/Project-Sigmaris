// lib/vscode/client.ts
// =====================================================
// VS Code 作業モード API Client（UI 用）
//
// - lib/vscode/types.ts と完全整合
// - FastAPI /vscode/* を直接叩く
// - DiffSet を正とする（unwrap しない）
// - 状態遷移は server state を正とする
// =====================================================

import {
  WorkMode,
  TargetFile,
  WorkPlan,
  DiffSet,
  StartSessionResponse,
  SetFilesResponse,
  GeneratePlanResponse,
  GenerateDiffResponse,
  PermissionResponse,
  CommitResponse,
} from "@/lib/vscode/types";

/* =====================================================
   Config
===================================================== */

const BASE_URL =
  process.env.NEXT_PUBLIC_VSCODE_API_URL ?? "http://localhost:8000";

/* =====================================================
   Utility
===================================================== */

/**
 * FastAPI 用 safe fetch
 * - HTTPException の body も拾う
 * - JSON 以外は即エラー
 */
async function safeFetch<T>(
  input: RequestInfo,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, {
    cache: "no-store",
    ...init,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "VSCode API request failed");
  }

  const contentType = res.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    throw new Error("Invalid response format from VSCode API");
  }

  return res.json() as Promise<T>;
}

/* =====================================================
   Session
===================================================== */

export async function startWorkSession(): Promise<StartSessionResponse> {
  return safeFetch<StartSessionResponse>(`${BASE_URL}/vscode/session/start`, {
    method: "POST",
  });
}

export async function endWorkSession(): Promise<{ status: string }> {
  return safeFetch<{ status: string }>(`${BASE_URL}/vscode/session/end`, {
    method: "POST",
  });
}

/* =====================================================
   Files
===================================================== */

export async function setWorkFiles(files: string[]): Promise<TargetFile[]> {
  const data = await safeFetch<SetFilesResponse>(`${BASE_URL}/vscode/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(files),
  });

  return data.files.map((path) => ({
    path,
    language: "unknown",
  }));
}

/* =====================================================
   Planning
===================================================== */

export async function generateWorkPlan(intent: string): Promise<WorkPlan> {
  const data = await safeFetch<GeneratePlanResponse>(
    `${BASE_URL}/vscode/plan`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(intent),
    }
  );

  return data.plan;
}

/* =====================================================
   Diff
===================================================== */

/**
 * 差分生成
 *
 * FastAPI Response:
 *   GenerateDiffResponse = {
 *     diffs: DiffSet;
 *     state: WorkMode;
 *   }
 *
 * ⚠️ ここでは unwrap しない
 * UI 側で response.diffs を扱う
 */
export async function generateDiff(
  fileContents: Record<string, string>
): Promise<GenerateDiffResponse> {
  return safeFetch<GenerateDiffResponse>(`${BASE_URL}/vscode/diff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fileContents),
  });
}

/* =====================================================
   Permission
===================================================== */

export async function approveWork(): Promise<PermissionResponse> {
  return safeFetch<PermissionResponse>(
    `${BASE_URL}/vscode/permission/approve`,
    { method: "POST" }
  );
}

export async function rejectWork(): Promise<PermissionResponse> {
  return safeFetch<PermissionResponse>(`${BASE_URL}/vscode/permission/reject`, {
    method: "POST",
  });
}

/* =====================================================
   Commit
===================================================== */

export async function commitWork(): Promise<CommitResponse> {
  return safeFetch<CommitResponse>(`${BASE_URL}/vscode/commit`, {
    method: "POST",
  });
}
