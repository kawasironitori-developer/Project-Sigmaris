// ============================================================
// Sigmaris AEI Core API Client (B-Spec Full Version)
// ============================================================

// ----------------------------------------------
// BASE URL
// ----------------------------------------------
export const BASE = (
  process.env.NEXT_PUBLIC_SIGMARIS_CORE ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");

// ----------------------------------------------
// 共通 Fetch Wrapper
// ----------------------------------------------
async function request(endpoint: string, options?: RequestInit): Promise<any> {
  const url = `${BASE}${endpoint}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers ?? {}),
      },
    });

    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    if (!res.ok) {
      console.error(
        "[Sigmaris API Error]",
        endpoint,
        res.status,
        json ?? "(no json)"
      );
      throw new Error(`API error at ${endpoint}: status ${res.status}`);
    }

    return json;
  } catch (err) {
    console.error("[Sigmaris API Failure]", endpoint, err);
    throw err;
  }
}

// ============================================================
// 型定義（B-Spec Full）
// ============================================================

export interface TraitVector {
  calm: number;
  empathy: number;
  curiosity: number;
}

export interface IdentityBaseline {
  calm: number;
  empathy: number;
  curiosity: number;
}

export interface IdentitySnapshot {
  calm?: number;
  empathy?: number;
  curiosity?: number;
  reflection?: string;
  meta_summary?: string;
  persona_vector?: TraitVector;
  baseline?: IdentityBaseline | null;
  timestamp?: string;
  identity_snapshot?: any;
  [key: string]: any;
}

export interface EmotionState {
  label?: string;
  score?: number;
  [key: string]: any;
}

export interface RewardState {
  reward?: number;
  reason?: string;
  [key: string]: any;
}

export interface ValueState {
  value?: Record<string, any>;
  [key: string]: any;
}

export interface MetaState {
  reflection?: string;
  meta_summary?: string;
  [key: string]: any;
}

export interface LongTermState {
  longterm?: any;
  [key: string]: any;
}

export interface MemoryDump {
  episodes?: any[];
  [key: string]: any;
}

// ============================================================
// B-Spec Sync Payload（最新版 /sync）
// ============================================================

export interface SyncPayload {
  chat: { user: string | null; ai: string | null } | null;

  context: {
    traits: TraitVector;
    safety: any | null;
    summary: any | null;
    recent: any | null;
  };

  identity?: {
    reflection?: string;
    meta_summary?: string;
    growth?: number;
    baseline?: TraitVector | null;
    identitySnapshot?: any;
  };
}

// /sync response
export interface SyncResponse {
  identity?: IdentitySnapshot;
  updated_persona?: {
    calm?: number;
    empathy?: number;
    curiosity?: number;
    reflection?: string;
    meta_summary?: string;
    growth?: number;
  };
  emotion?: EmotionState;
  reward?: RewardState;
  value?: ValueState;
  meta?: MetaState;
  longterm?: LongTermState;
  episode?: any;
  [key: string]: any;
}

// ============================================================
// ★ AEI-Core Sync（人格統合の中心 API）
// ============================================================
export async function requestSync(payload: SyncPayload): Promise<SyncResponse> {
  return request("/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ============================================================
// 下層 API 群（補助）
// ============================================================

// Reflection（短期）
export async function reflect(text: string) {
  return request("/reflect", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

// Introspection（中期）
export async function introspect() {
  return request("/introspect", { method: "POST" });
}

// LongTerm（長期心理）
export async function longterm(): Promise<LongTermState> {
  return request("/longterm", { method: "POST" });
}

// Meta Reflection（深層）
export async function meta(): Promise<{ meta: MetaState }> {
  return request("/meta", { method: "POST" });
}

// Reward System（報酬）
export async function reward(): Promise<{ reward: RewardState }> {
  return request("/reward", { method: "POST" });
}

export async function rewardState() {
  return request("/reward/state", { method: "GET" });
}

// EmotionCore（感情推定）
export async function emotion(
  text: string
): Promise<{ emotion: EmotionState }> {
  return request("/emotion", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

// ValueCore（価値観）
export async function value(): Promise<{ value: ValueState }> {
  return request("/value", { method: "POST" });
}

export async function valueState() {
  return request("/value/state", { method: "GET" });
}

// Episodic Memory
export async function memory(): Promise<MemoryDump> {
  return request("/memory", { method: "GET" });
}

// Identity Snapshot
export async function getIdentity(): Promise<IdentitySnapshot> {
  return request("/identity", { method: "GET" });
}
