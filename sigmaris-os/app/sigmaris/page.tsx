"use client";

import { useState } from "react";
import {
  reflect,
  introspect,
  longterm,
  meta,
  getIdentity,
  reward,
  emotion,
  value,
  valueState,
  memory, // ★ 追加
} from "@/lib/sigmaris-api";

type Mode =
  | "idle"
  | "reflect"
  | "introspect"
  | "longterm"
  | "psychology"
  | "meta"
  | "reward"
  | "emotion"
  | "value"
  | "valueState"
  | "memory" // ★ 追加
  | "identity";

export default function SigmarisPage() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [log, setLog] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(mode: Mode, fn: () => Promise<any>) {
    setMode(mode);
    setLoading(true);
    setError(null);
    try {
      const res = await fn();
      setLog(res);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Sigmaris AEI Control Panel
        </h1>

        {/* 入力欄 */}
        <div className="space-y-2">
          <label className="text-sm text-slate-300">
            Reflection / Emotion input
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="今日は少し集中力が高かった。"
            className="w-full h-28 rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        {/* ボタン群 */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => run("reflect", () => reflect(input))}
            className="px-4 py-2 rounded-md bg-cyan-500 text-sm font-medium hover:bg-cyan-400 disabled:opacity-50"
            disabled={loading}
          >
            Reflect
          </button>

          <button
            onClick={() => run("introspect", () => introspect())}
            className="px-4 py-2 rounded-md bg-slate-700 text-sm font-medium hover:bg-slate-600 disabled:opacity-50"
            disabled={loading}
          >
            Introspect
          </button>

          <button
            onClick={() => run("longterm", () => longterm())}
            className="px-4 py-2 rounded-md bg-slate-700 text-sm font-medium hover:bg-slate-600 disabled:opacity-50"
            disabled={loading}
          >
            LongTerm
          </button>

          {/* PsychologyCore */}
          <button
            onClick={() => run("psychology", () => longterm())}
            className="px-4 py-2 rounded-md bg-purple-600 text-sm font-medium hover:bg-purple-500 disabled:opacity-50"
            disabled={loading}
          >
            Psychology
          </button>

          <button
            onClick={() => run("meta", () => meta())}
            className="px-4 py-2 rounded-md bg-slate-700 text-sm font-medium hover:bg-slate-600 disabled:opacity-50"
            disabled={loading}
          >
            Meta
          </button>

          <button
            onClick={() => run("reward", () => reward())}
            className="px-4 py-2 rounded-md bg-amber-600 text-sm font-medium hover:bg-amber-500 disabled:opacity-50"
            disabled={loading}
          >
            Reward
          </button>

          <button
            onClick={() => run("emotion", () => emotion(input))}
            className="px-4 py-2 rounded-md bg-rose-600 text-sm font-medium hover:bg-rose-500 disabled:opacity-50"
            disabled={loading}
          >
            Emotion
          </button>

          {/* Value */}
          <button
            onClick={() => run("value", () => value())}
            className="px-4 py-2 rounded-md bg-emerald-600 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
            disabled={loading}
          >
            Value Observe
          </button>

          <button
            onClick={() => run("valueState", () => valueState())}
            className="px-4 py-2 rounded-md bg-emerald-800 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            disabled={loading}
          >
            Value State
          </button>

          {/* ★ Episodic Memory */}
          <button
            onClick={() => run("memory", () => memory())}
            className="px-4 py-2 rounded-md bg-indigo-600 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
            disabled={loading}
          >
            Memory
          </button>

          <button
            onClick={() => run("identity", () => getIdentity())}
            className="px-4 py-2 rounded-md border border-slate-600 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
            disabled={loading}
          >
            Identity
          </button>
        </div>

        {/* ステータス */}
        <div className="text-xs text-slate-400">
          Mode: <span className="font-mono">{mode}</span>{" "}
          {loading && <span>(loading…)</span>}
        </div>

        {error && (
          <div className="text-xs text-red-400">
            Error: <span className="font-mono">{error}</span>
          </div>
        )}

        {/* レスポンス JSON */}
        <pre className="mt-4 bg-black/80 rounded-md p-4 text-xs overflow-auto">
          {log ? JSON.stringify(log, null, 2) : "No output yet"}
        </pre>
      </div>
    </div>
  );
}
