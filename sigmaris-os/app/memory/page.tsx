"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { SigmarisLangProvider } from "@/lib/sigmarisLangContext";

type Episode = {
  episode_id: string;
  timestamp: string;
  summary: string;
  raw_context: string | null;
  meta: any | null;
  created_at: string;
};

export default function MemoryPage() {
  return (
    <SigmarisLangProvider>
      <MemoryContent />
    </SigmarisLangProvider>
  );
}

function MemoryContent() {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/memory/episodes?limit=80", {
        credentials: "include",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Request failed");
      setEpisodes(j?.episodes ?? []);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function delEpisode(id: string) {
    if (!confirm("このメモリ（episode）を削除します。よろしいですか？")) return;
    try {
      const r = await fetch(`/api/memory/episodes/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? "Delete failed");
      setEpisodes((prev) => prev.filter((e) => e.episode_id !== id));
    } catch (e: any) {
      alert(e?.message ?? String(e));
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1a2230] text-[#e6eef4] px-6 md:px-16 py-24">
      <Header />

      <div className="max-w-5xl mx-auto mt-16 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[#4c7cf7]">Memory</h1>
          <p className="text-sm text-[#b9c4d2] mt-2">
            永続メモリ（Episodic）を一覧表示し、削除できます。削除は不可逆です。
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={reload}
            className="px-4 py-2 rounded-lg border border-[#4c7cf7]/40 hover:bg-[#4c7cf7]/10 transition text-sm"
          >
            Reload
          </button>
        </div>

        {loading ? (
          <div className="text-[#b9c4d2]">Loading...</div>
        ) : err ? (
          <div className="text-[#fb7185]">{err}</div>
        ) : episodes.length === 0 ? (
          <div className="text-[#b9c4d2]">No episodes.</div>
        ) : (
          <div className="space-y-3">
            {episodes.map((ep) => (
              <div
                key={ep.episode_id}
                className="border border-[#4c7cf7]/25 rounded-2xl p-4 bg-[#141c26]/40 backdrop-blur-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-[#94a3b8] break-all">
                      {ep.episode_id}
                    </div>
                    <div className="text-sm font-semibold mt-1">
                      {ep.summary ?? "(no summary)"}
                    </div>
                    <div className="text-xs text-[#94a3b8] mt-1">
                      {new Date(ep.timestamp ?? ep.created_at).toLocaleString("ja-JP")}
                    </div>
                    {ep.raw_context ? (
                      <div className="text-xs text-[#c9d2df] mt-3 whitespace-pre-wrap">
                        {ep.raw_context}
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => delEpisode(ep.episode_id)}
                    className="shrink-0 px-3 py-1 rounded-lg border border-[#fb7185]/50 text-[#fb7185] hover:bg-[#fb7185]/10 transition text-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

