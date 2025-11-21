// lib/sigmaris-api.ts

// ============================================================
// BASE URL（環境変数 → ローカル固定値）
// ============================================================
export const BASE = (
  process.env.NEXT_PUBLIC_SIGMARIS_CORE ?? "http://127.0.0.1:8000"
).replace(/\/+$/, ""); // 最後のスラッシュを除去

// ============================================================
// 共通 Fetch Wrapper（詳細ログ付き）
// ============================================================
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

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[Sigmaris API Error]`, endpoint, res.status, text);
      throw new Error(`API error at ${endpoint}: status ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.error(`[Sigmaris API Failure]`, endpoint, err);
    throw err;
  }
}

// ============================================================
// AEI API Wrappers（各モジュール専用）
// ============================================================

// ------------------------------------------------------------
// Reflection（短期）
// ------------------------------------------------------------
export async function reflect(text: string) {
  return request("/reflect", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

// ------------------------------------------------------------
// Introspection（中期）
// ------------------------------------------------------------
export async function introspect() {
  return request("/introspect", { method: "POST" });
}

// ------------------------------------------------------------
// LongTerm（長期）
// ------------------------------------------------------------
export async function longterm() {
  return request("/longterm", { method: "POST" });
}

// ------------------------------------------------------------
// Meta Reflection（深層）
// ------------------------------------------------------------
export async function meta() {
  return request("/meta", { method: "POST" });
}

// ------------------------------------------------------------
// Reward System（報酬系）
// ------------------------------------------------------------
export async function reward() {
  return request("/reward", { method: "POST" });
}

// Reward 状態（キャッシュ取得）
export async function rewardState() {
  return request("/reward/state");
}

// ------------------------------------------------------------
// EmotionCore（深層感情解析）
// ------------------------------------------------------------
export async function emotion(text: string) {
  return request("/emotion", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

// ------------------------------------------------------------
// ValueCore（価値状態）
// ------------------------------------------------------------
export async function value() {
  return request("/value", { method: "POST" });
}

export async function valueState() {
  return request("/value/state");
}

// ------------------------------------------------------------
// Episodic Memory（全エピソード）★ 新規追加
// ------------------------------------------------------------
export async function memory() {
  return request("/memory");
}

// ------------------------------------------------------------
// Identity Snapshot（状態全体）
// ------------------------------------------------------------
export async function getIdentity() {
  return request("/identity");
}
