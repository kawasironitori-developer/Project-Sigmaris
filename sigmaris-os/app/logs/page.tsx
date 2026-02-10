"use client";

import { useMemo, useState } from "react";
import Header from "@/components/Header";
import { SigmarisLangProvider } from "@/lib/sigmarisLangContext";

function isoNow() {
  return new Date().toISOString();
}

export default function LogsPage() {
  return (
    <SigmarisLangProvider>
      <LogsContent />
    </SigmarisLangProvider>
  );
}

function LogsContent() {
  const [sessionId, setSessionId] = useState("");
  const [since, setSince] = useState("");
  const [limit, setLimit] = useState(200);
  const [includePhase02, setIncludePhase02] = useState(true);

  const [incMessages, setIncMessages] = useState(true);
  const [incState, setIncState] = useState(true);
  const [incTelemetry, setIncTelemetry] = useState(true);
  const [incTid, setIncTid] = useState(true);
  const [incSubjectivity, setIncSubjectivity] = useState(true);
  const [incFailure, setIncFailure] = useState(true);
  const [incIdentity, setIncIdentity] = useState(true);
  const [incTrace, setIncTrace] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastBytes, setLastBytes] = useState<number | null>(null);
  const [lastPreview, setLastPreview] = useState<string>("");

  const includeList = useMemo(() => {
    const inc: string[] = [];
    if (incMessages) inc.push("messages");
    if (incState) inc.push("state");
    if (incTelemetry) inc.push("telemetry");
    if (incTid) inc.push("temporal_identity");
    if (incSubjectivity) inc.push("subjectivity");
    if (incFailure) inc.push("failure");
    if (incIdentity) inc.push("identity");
    if (incTrace) inc.push("trace_events");
    return inc;
  }, [
    incMessages,
    incState,
    incTelemetry,
    incTid,
    incSubjectivity,
    incFailure,
    incIdentity,
    incTrace,
  ]);

  async function runExport(download: boolean) {
    setBusy(true);
    setError(null);
    try {
      const url = new URL("/api/logs/export", window.location.origin);
      if (sessionId.trim()) url.searchParams.set("session_id", sessionId.trim());
      if (since.trim()) url.searchParams.set("since", since.trim());
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("include", includeList.join(","));
      url.searchParams.set("include_phase02", includePhase02 ? "1" : "0");

      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }

      const text = JSON.stringify(json, null, 2);
      const bytes = new Blob([text], { type: "application/json" }).size;
      setLastBytes(bytes);
      setLastPreview(text.slice(0, 2000));

      if (download) {
        const blob = new Blob([text], { type: "application/json" });
        const a = document.createElement("a");
        const ts = isoNow().replace(/[:.]/g, "-");
        const safeSession = (sessionId.trim() || "all").replace(/[^a-zA-Z0-9_-]/g, "_");
        a.href = URL.createObjectURL(blob);
        a.download = `sigmaris-logs_${safeSession}_${ts}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
    } catch (e: any) {
      setError(e?.message ?? "export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1118] text-[#e6eef4]">
      <Header />
      <main className="max-w-5xl mx-auto px-6 pt-28 pb-16">
        <h1 className="text-2xl font-semibold">Logs Export</h1>
        <p className="mt-2 text-sm text-[#c9d2df]">
          Supabase の <code className="text-[#e6eef4]">common_*</code> テーブルから、
          メッセージ・状態スナップショット・テレメトリ等をまとめて JSON で取得します。
          （未ログインの場合は 401 になります）
        </p>

        <div className="mt-6 grid gap-4 rounded-xl border border-[#1f2835] bg-[#0e141b]/60 p-5">
          <div className="grid gap-2">
            <label className="text-sm text-[#c9d2df]">session_id（任意）</label>
            <input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="例: 6df623b9-5674-422f-8d4d-1663e2dc5e15"
              className="w-full rounded-lg bg-[#0b1118] border border-[#1f2835] px-3 py-2 text-sm"
            />
            <div className="text-xs text-[#8ea0b8]">
              空なら全セッション横断（limit は各テーブルに適用）
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm text-[#c9d2df]">since（任意 / ISO）</label>
            <input
              value={since}
              onChange={(e) => setSince(e.target.value)}
              placeholder="例: 2026-02-10T00:00:00.000Z"
              className="w-full rounded-lg bg-[#0b1118] border border-[#1f2835] px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm text-[#c9d2df]">limit（1〜2000）</label>
            <input
              type="number"
              value={limit}
              min={1}
              max={2000}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full rounded-lg bg-[#0b1118] border border-[#1f2835] px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              id="incPhase02"
              type="checkbox"
              checked={includePhase02}
              onChange={(e) => setIncludePhase02(e.target.checked)}
            />
            <label htmlFor="incPhase02" className="text-sm text-[#c9d2df]">
              Phase02 系スナップショットも含める（temporal/subjectivity/failure/identity/trace）
            </label>
          </div>

          <div className="grid gap-2">
            <div className="text-sm text-[#c9d2df]">include</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={incMessages}
                  onChange={(e) => setIncMessages(e.target.checked)}
                />
                messages
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={incState}
                  onChange={(e) => setIncState(e.target.checked)}
                />
                state
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={incTelemetry}
                  onChange={(e) => setIncTelemetry(e.target.checked)}
                />
                telemetry
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={incTid}
                  onChange={(e) => setIncTid(e.target.checked)}
                  disabled={!includePhase02}
                />
                temporal_identity
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={incSubjectivity}
                  onChange={(e) => setIncSubjectivity(e.target.checked)}
                  disabled={!includePhase02}
                />
                subjectivity
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={incFailure}
                  onChange={(e) => setIncFailure(e.target.checked)}
                  disabled={!includePhase02}
                />
                failure
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={incIdentity}
                  onChange={(e) => setIncIdentity(e.target.checked)}
                  disabled={!includePhase02}
                />
                identity
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={incTrace}
                  onChange={(e) => setIncTrace(e.target.checked)}
                  disabled={!includePhase02}
                />
                trace_events
              </label>
            </div>
            <div className="text-xs text-[#8ea0b8]">
              ※ <code className="text-[#e6eef4]">trace_events</code> はデータ量が増えやすいので必要時のみ推奨
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              disabled={busy}
              onClick={() => runExport(false)}
              className="px-4 py-2 rounded-lg border border-[#4c7cf7] text-[#e6eef4] hover:bg-[#4c7cf7]/15 disabled:opacity-60"
            >
              {busy ? "Loading..." : "Preview"}
            </button>
            <button
              disabled={busy}
              onClick={() => runExport(true)}
              className="px-4 py-2 rounded-lg bg-[#4c7cf7] text-white hover:bg-[#3e6be0] disabled:opacity-60"
            >
              {busy ? "Exporting..." : "Download JSON"}
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
              {error}
            </div>
          )}

          {lastBytes !== null && (
            <div className="text-xs text-[#8ea0b8]">
              Last export size: {Math.round(lastBytes / 1024)} KB
            </div>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-[#1f2835] bg-[#0e141b]/60 p-5">
          <div className="text-sm text-[#c9d2df] mb-2">Preview（先頭 2000 文字）</div>
          <pre className="text-xs overflow-auto whitespace-pre-wrap break-words text-[#e6eef4]">
            {lastPreview || "（Preview を押すとここに表示されます）"}
          </pre>
        </div>
      </main>
    </div>
  );
}
