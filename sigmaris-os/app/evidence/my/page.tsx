"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { SigmarisLangProvider, useSigmarisLang } from "@/lib/sigmarisLangContext";

type EvidenceResponse = {
  ok?: boolean;
  user_hint?: string;
  sessions?: number;
  messages?: number;
  by_role?: Record<string, number>;
  newest_at?: string | null;
  oldest_at?: string | null;
  meta_samples?: any[];
  error?: string;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function safeJson(v: any) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export default function MyEvidencePage() {
  return (
    <SigmarisLangProvider>
      <MyEvidenceContent />
    </SigmarisLangProvider>
  );
}

function MyEvidenceContent() {
  const { lang } = useSigmarisLang();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EvidenceResponse | null>(null);

  const title = lang === "ja" ? "自分の証拠（会話本文は非公開）" : "My Evidence (no message contents)";

  const apiUrl = useMemo(() => "/api/ops/portfolio-evidence", []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(apiUrl, { credentials: "include" });
        const j = (await r.json().catch(() => null)) as EvidenceResponse | null;
        if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        setData(j);
      } catch (e: any) {
        setError(e?.message ?? "failed to load");
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [apiUrl]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />

      <main className="pt-28 px-6 pb-12 max-w-5xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold">{title}</h1>
        <p className="text-gray-400 mt-2 text-sm">
          件数・期間・メタ情報のサンプルだけを表示します。会話本文（content）は取得/表示しません。
        </p>

        {loading ? (
          <div className="mt-8 text-gray-400">Loading...</div>
        ) : error ? (
          <div className="mt-8 bg-red-950/30 border border-red-700 rounded-xl p-4">
            <div className="font-semibold text-red-200">Error</div>
            <div className="text-red-200/80 text-sm mt-1">{error}</div>
            <div className="text-gray-400 text-xs mt-3">
              ログインしていない場合は 401 になります。
            </div>
          </div>
        ) : data ? (
          <>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="text-gray-400 text-xs">user</div>
                <div className="mt-2 text-lg font-semibold">
                  {data.user_hint ?? "-"}
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="text-gray-400 text-xs">sessions</div>
                <div className="mt-2 text-2xl font-bold">
                  {fmt(Number(data.sessions ?? 0))}
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="text-gray-400 text-xs">messages</div>
                <div className="mt-2 text-2xl font-bold">
                  {fmt(Number(data.messages ?? 0))}
                </div>
              </div>
            </div>

            <div className="mt-6 bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-sm font-semibold">Range</div>
              <div className="mt-2 text-sm text-gray-300">
                newest: <span className="text-gray-100">{fmtDate(data.newest_at)}</span>
              </div>
              <div className="mt-1 text-sm text-gray-300">
                oldest: <span className="text-gray-100">{fmtDate(data.oldest_at)}</span>
              </div>
            </div>

            <div className="mt-6 bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-sm font-semibold">By role</div>
              <pre className="mt-3 text-xs text-gray-200 whitespace-pre-wrap">
                {safeJson(data.by_role ?? {})}
              </pre>
            </div>

            <div className="mt-6 bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-sm font-semibold">Meta samples (AI turns)</div>
              <div className="text-gray-400 text-xs mt-2">
                build_sha / config_hash / meta_v1 / persona_runtime などの「再現性のための情報」だけを表示します。
              </div>
              <pre className="mt-3 text-xs text-gray-200 whitespace-pre-wrap">
                {safeJson((data.meta_samples ?? []).slice(0, 8))}
              </pre>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

