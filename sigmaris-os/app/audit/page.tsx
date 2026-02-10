"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { SigmarisLangProvider } from "@/lib/sigmarisLangContext";

type SessionItem = {
  id: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
  messageCount: number;
};

type MessageRow = {
  id: number;
  session_id: string | null;
  app: string | null;
  role: "user" | "ai" | string;
  content: string;
  created_at: string;
};

type StateSnapshotRow = {
  id: number;
  session_id: string | null;
  trace_id: string | null;
  meta: any | null;
  created_at: string;
};

type DecisionCandidate = {
  id: string;
  label: string;
  score: number;
  reason: string;
};

type Turn = {
  index: number;
  user: { text: string; at: string } | null;
  ai: { text: string; at: string } | null;
  snapshot: StateSnapshotRow | null;
  meta: any | null;
};

function isRecord(v: any): v is Record<string, any> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function num(v: any, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function fmtDateTime(iso: string) {
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

function getMetaV1(meta: any): any {
  if (!isRecord(meta)) return null;
  if (isRecord(meta.v1)) return meta.v1;
  return meta;
}

function getDecisionCandidates(meta: any): DecisionCandidate[] {
  const m = getMetaV1(meta);
  if (!isRecord(m)) return [];
  const arr = m.decision_candidates;
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => isRecord(x))
    .map((x) => ({
      id: String(x.id ?? ""),
      label: String(x.label ?? ""),
      score: num(x.score, 0),
      reason: String(x.reason ?? ""),
    }));
}

function getDialogueState(meta: any): string {
  const m = getMetaV1(meta);
  if (!isRecord(m)) return "UNKNOWN";
  const s = m.dialogue_state;
  return typeof s === "string" && s.trim() ? s.trim() : "UNKNOWN";
}

function getSafety(meta: any): { total_risk: number; override: boolean } {
  const m = getMetaV1(meta);
  if (!isRecord(m)) return { total_risk: 0, override: false };
  const s = m.safety;
  if (!isRecord(s)) return { total_risk: 0, override: false };
  return {
    total_risk: clamp01(num(s.total_risk, 0)),
    override: Boolean(s.override ?? false),
  };
}

function getTelemetry(meta: any): Record<"C" | "N" | "M" | "S" | "R", number> {
  const m = getMetaV1(meta);
  const z = { C: 0, N: 0, M: 0, S: 0, R: 0 } as const;
  if (!isRecord(m)) return { ...z };
  const t = m.telemetry;
  if (!isRecord(t)) return { ...z };
  return {
    C: clamp01(num(t.C, 0)),
    N: clamp01(num(t.N, 0)),
    M: clamp01(num(t.M, 0)),
    S: clamp01(num(t.S, 0)),
    R: clamp01(num(t.R, 0)),
  };
}

function getRecovery(meta: any): {
  active: boolean;
  forced_dialogue_state: string;
  stop_memory_injection: boolean;
  reasons: string[];
} {
  const m = getMetaV1(meta);
  if (!isRecord(m)) {
    return { active: false, forced_dialogue_state: "", stop_memory_injection: false, reasons: [] };
  }
  const r = m.recovery;
  if (!isRecord(r)) {
    return { active: false, forced_dialogue_state: "", stop_memory_injection: false, reasons: [] };
  }
  return {
    active: Boolean(r.active ?? false),
    forced_dialogue_state: String(r.forced_dialogue_state ?? ""),
    stop_memory_injection: Boolean(r.stop_memory_injection ?? false),
    reasons: Array.isArray(r.reasons) ? r.reasons.map((x) => String(x)) : [],
  };
}

function topIntents(meta: any, limit = 6): { label: string; score: number }[] {
  const m = getMetaV1(meta);
  if (!isRecord(m)) return [];
  const intent = m.intent;
  if (!isRecord(intent)) return [];
  const rows = Object.entries(intent)
    .filter(([k, v]) => typeof k === "string" && typeof v === "number")
    .map(([label, score]) => ({ label, score: clamp01(score as number) }))
    .sort((a, b) => b.score - a.score);
  return rows.slice(0, limit);
}

async function downloadJson(url: string, filename: string) {
  const res = await fetch(url, { credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error ?? `HTTP ${res.status}`);
  }
  const text = JSON.stringify(json, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function AuditPage() {
  return (
    <SigmarisLangProvider>
      <AuditContent />
    </SigmarisLangProvider>
  );
}

function AuditContent() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionQuery, setSessionQuery] = useState("");
  const [activeSession, setActiveSession] = useState<string | null>(null);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeTurnIdx, setActiveTurnIdx] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("ALL");
  const [overrideOnly, setOverrideOnly] = useState(false);
  const [minRisk, setMinRisk] = useState<number>(0);

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        const r = await fetch("/api/sessions", { credentials: "include" });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        const list = Array.isArray(j?.sessions) ? (j.sessions as SessionItem[]) : [];
        setSessions(list);
        if (!activeSession && list.length > 0) setActiveSession(list[0].id);
      } catch (e: any) {
        setError(e?.message ?? "failed to load sessions");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeSession) return;
    (async () => {
      setLoading(true);
      setError(null);
      setActiveTurnIdx(0);
      try {
        const url = new URL("/api/logs/export", window.location.origin);
        url.searchParams.set("session_id", activeSession);
        url.searchParams.set("limit", "2000");
        url.searchParams.set("include", "messages,state");
        url.searchParams.set("include_phase02", "0");

        const r = await fetch(url.toString(), { credentials: "include" });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

        const messagesRaw: MessageRow[] = Array.isArray(j?.messages) ? j.messages : [];
        const stateRaw: StateSnapshotRow[] = Array.isArray(j?.state) ? j.state : [];

        const messages = messagesRaw
          .filter((m) => m?.app === "sigmaris")
          .slice()
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        const snapshots = stateRaw
          .slice()
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        const built: Turn[] = [];
        let snapIdx = 0;

        const nextSnapshotFor = (atIso: string): StateSnapshotRow | null => {
          const at = new Date(atIso).getTime();
          if (!snapshots.length) return null;

          // advance to first snapshot >= message time - small slack
          while (
            snapIdx < snapshots.length &&
            new Date(snapshots[snapIdx].created_at).getTime() < at - 2000
          ) {
            snapIdx += 1;
          }

          const candidates: StateSnapshotRow[] = [];
          for (const j of [snapIdx - 1, snapIdx, snapIdx + 1]) {
            if (j < 0 || j >= snapshots.length) continue;
            candidates.push(snapshots[j]);
          }
          if (!candidates.length) return null;

          let best = candidates[0];
          let bestDt = Math.abs(new Date(best.created_at).getTime() - at);
          for (const c of candidates.slice(1)) {
            const dt = Math.abs(new Date(c.created_at).getTime() - at);
            if (dt < bestDt) {
              best = c;
              bestDt = dt;
            }
          }
          return best;
        };

        for (let i = 0; i < messages.length; i++) {
          const m = messages[i];
          if (m.role !== "user") continue;
          const user = { text: String(m.content ?? ""), at: m.created_at };

          // find next ai message
          let aiMsg: MessageRow | null = null;
          for (let k = i + 1; k < messages.length; k++) {
            if (messages[k].role === "ai") {
              aiMsg = messages[k];
              i = k; // move outer cursor
              break;
            }
            if (messages[k].role === "user") break;
          }
          const ai = aiMsg ? { text: String(aiMsg.content ?? ""), at: aiMsg.created_at } : null;

          const snap = ai ? nextSnapshotFor(ai.at) : null;
          built.push({
            index: built.length + 1,
            user,
            ai,
            snapshot: snap,
            meta: snap?.meta ?? null,
          });
        }

        setTurns(built);
      } catch (e: any) {
        setError(e?.message ?? "failed to load audit data");
        setTurns([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [activeSession]);

  const filteredSessions = useMemo(() => {
    const s = sessionQuery.trim().toLowerCase();
    if (!s) return sessions;
    return sessions.filter((x) =>
      [x.id, x.title, x.lastMessage].some((t) => String(t).toLowerCase().includes(s))
    );
  }, [sessions, sessionQuery]);

  const availableStates = useMemo(() => {
    const set = new Set<string>();
    for (const t of turns) {
      set.add(getDialogueState(t.meta));
    }
    return ["ALL", ...Array.from(set).filter(Boolean).sort()];
  }, [turns]);

  const filteredTurns = useMemo(() => {
    const s = q.trim().toLowerCase();
    return turns.filter((t) => {
      if (stateFilter !== "ALL" && getDialogueState(t.meta) !== stateFilter) return false;
      const safety = getSafety(t.meta);
      if (overrideOnly && !safety.override) return false;
      if (safety.total_risk < minRisk) return false;
      if (!s) return true;
      const u = t.user?.text ?? "";
      const a = t.ai?.text ?? "";
      const metaText = safeJson(getMetaV1(t.meta));
      return [u, a, metaText].some((x) => String(x).toLowerCase().includes(s));
    });
  }, [turns, q, stateFilter, overrideOnly, minRisk]);

  const activeTurn = filteredTurns[Math.min(activeTurnIdx, Math.max(0, filteredTurns.length - 1))] ?? null;

  async function downloadActiveSession() {
    if (!activeSession) return;
    const url = new URL("/api/logs/export", window.location.origin);
    url.searchParams.set("session_id", activeSession);
    url.searchParams.set("limit", "2000");
    url.searchParams.set("include", "messages,state,telemetry");
    url.searchParams.set("include_phase02", "1");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    await downloadJson(url.toString(), `sigmaris-audit_${activeSession}_${ts}.json`);
  }

  return (
    <div className="min-h-screen bg-[#0b1118] text-[#e6eef4]">
      <Header />
      <main className="max-w-7xl mx-auto px-6 pt-28 pb-16">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Audit</h1>
            <p className="mt-2 text-sm text-[#c9d2df]">
              セッション→ターン→meta（intent / dialogue_state / telemetry / safety / decision_candidates）を追跡します。
            </p>
          </div>
          <button
            onClick={() => downloadActiveSession().catch((e) => setError(e?.message ?? "download failed"))}
            disabled={!activeSession}
            className="px-4 py-2 rounded-lg border border-[#4c7cf7] text-[#e6eef4] hover:bg-[#4c7cf7]/15 disabled:opacity-60"
          >
            Download JSON
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-700/50 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* sessions */}
          <section className="lg:col-span-3 rounded-xl border border-[#1f2835] bg-[#0e141b]/60">
            <div className="p-4 border-b border-[#1f2835]">
              <div className="text-sm text-[#c9d2df]">Sessions</div>
              <input
                value={sessionQuery}
                onChange={(e) => setSessionQuery(e.target.value)}
                placeholder="search..."
                className="mt-2 w-full rounded-lg bg-[#0b1118] border border-[#1f2835] px-3 py-2 text-sm"
              />
            </div>
            <div className="max-h-[60vh] overflow-auto">
              {filteredSessions.map((s) => {
                const active = s.id === activeSession;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSession(s.id)}
                    className={`w-full text-left px-4 py-3 border-b border-[#141b24] hover:bg-[#4c7cf7]/10 ${
                      active ? "bg-[#4c7cf7]/15" : ""
                    }`}
                  >
                    <div className="text-sm font-medium truncate">{s.title}</div>
                    <div className="mt-1 text-xs text-[#8ea0b8] truncate">
                      {s.lastMessage} · {new Date(s.updatedAt).toLocaleDateString("ja-JP")}
                    </div>
                  </button>
                );
              })}
              {filteredSessions.length === 0 && (
                <div className="p-4 text-sm text-[#8ea0b8]">No sessions</div>
              )}
            </div>
          </section>

          {/* turns */}
          <section className="lg:col-span-4 rounded-xl border border-[#1f2835] bg-[#0e141b]/60">
            <div className="p-4 border-b border-[#1f2835] grid gap-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-[#c9d2df]">
                  Turns{" "}
                  <span className="text-xs text-[#8ea0b8]">
                    ({filteredTurns.length}/{turns.length})
                  </span>
                </div>
                {loading && <div className="text-xs text-[#8ea0b8]">Loading…</div>}
              </div>

              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="search text/meta..."
                className="w-full rounded-lg bg-[#0b1118] border border-[#1f2835] px-3 py-2 text-sm"
              />

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                  className="w-full rounded-lg bg-[#0b1118] border border-[#1f2835] px-3 py-2 text-sm"
                >
                  {availableStates.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <label className="flex items-center gap-2 text-sm text-[#c9d2df] px-2">
                  <input
                    type="checkbox"
                    checked={overrideOnly}
                    onChange={(e) => setOverrideOnly(e.target.checked)}
                  />
                  override only
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs text-[#8ea0b8]">
                  min risk
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={minRisk}
                    onChange={(e) => setMinRisk(Number(e.target.value))}
                    className="w-full rounded-lg bg-[#0b1118] border border-[#1f2835] px-3 py-2 text-sm"
                  />
                </label>
                <div className="text-xs text-[#8ea0b8] flex items-end">
                  risk=0..1 / safety.override で絞り込み
                </div>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              {filteredTurns.map((t, idx) => {
                const active = idx === activeTurnIdx;
                const ds = getDialogueState(t.meta);
                const safety = getSafety(t.meta);
                return (
                  <button
                    key={`${t.index}-${t.ai?.at ?? ""}`}
                    onClick={() => setActiveTurnIdx(idx)}
                    className={`w-full text-left px-4 py-3 border-b border-[#141b24] hover:bg-[#4c7cf7]/10 ${
                      active ? "bg-[#4c7cf7]/15" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-[#8ea0b8]">
                        #{t.index} · {t.ai?.at ? fmtDateTime(t.ai.at) : "—"}
                      </div>
                      <div className="text-[11px] text-[#c9d2df]">
                        {ds} · risk {safety.total_risk.toFixed(2)}
                        {safety.override ? " · override" : ""}
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-[#e6eef4] line-clamp-2">
                      {t.user?.text ?? ""}
                    </div>
                    <div className="mt-1 text-xs text-[#8ea0b8] line-clamp-1">
                      {t.ai?.text ?? ""}
                    </div>
                  </button>
                );
              })}
              {filteredTurns.length === 0 && (
                <div className="p-4 text-sm text-[#8ea0b8]">No turns</div>
              )}
            </div>
          </section>

          {/* details */}
          <section className="lg:col-span-5 rounded-xl border border-[#1f2835] bg-[#0e141b]/60">
            <div className="p-4 border-b border-[#1f2835]">
              <div className="text-sm text-[#c9d2df]">Turn details</div>
              {activeTurn ? (
                <div className="mt-2 text-xs text-[#8ea0b8]">
                  session: <code className="text-[#e6eef4]">{activeSession}</code> · turn{" "}
                  <code className="text-[#e6eef4]">#{activeTurn.index}</code>
                </div>
              ) : (
                <div className="mt-2 text-xs text-[#8ea0b8]">No selection</div>
              )}
            </div>

            <div className="p-4 grid gap-4">
              {!activeTurn ? (
                <div className="text-sm text-[#8ea0b8]">Select a turn.</div>
              ) : (
                <>
                  <div className="grid gap-2">
                    <div className="text-xs text-[#8ea0b8]">User</div>
                    <div className="rounded-lg border border-[#1f2835] bg-[#0b1118] p-3 text-sm whitespace-pre-wrap">
                      {activeTurn.user?.text ?? ""}
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <div className="text-xs text-[#8ea0b8]">AI</div>
                    <div className="rounded-lg border border-[#1f2835] bg-[#0b1118] p-3 text-sm whitespace-pre-wrap">
                      {activeTurn.ai?.text ?? ""}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <div className="text-xs text-[#8ea0b8]">Signals</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-lg border border-[#1f2835] bg-[#0b1118] p-3">
                        <div className="text-xs text-[#8ea0b8]">dialogue_state</div>
                        <div className="mt-1">{getDialogueState(activeTurn.meta)}</div>
                      </div>
                      <div className="rounded-lg border border-[#1f2835] bg-[#0b1118] p-3">
                        <div className="text-xs text-[#8ea0b8]">safety</div>
                        {(() => {
                          const s = getSafety(activeTurn.meta);
                          return (
                            <div className="mt-1">
                              risk {s.total_risk.toFixed(2)} ·{" "}
                              {s.override ? "override" : "no override"}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="rounded-lg border border-[#1f2835] bg-[#0b1118] p-3 col-span-2">
                        <div className="text-xs text-[#8ea0b8]">auto_recovery</div>
                        {(() => {
                          const r = getRecovery(activeTurn.meta);
                          if (!r.active) return <div className="mt-1">inactive</div>;
                          return (
                            <div className="mt-1 grid gap-1 text-xs text-[#c9d2df]">
                              <div>
                                forced:{" "}
                                <span className="font-mono">
                                  {r.forced_dialogue_state || "?"}
                                </span>
                              </div>
                              <div>
                                stop_memory_injection:{" "}
                                {r.stop_memory_injection ? "true" : "false"}
                              </div>
                              <div className="text-[#8ea0b8]">
                                reasons:{" "}
                                {r.reasons.length ? r.reasons.join(", ") : "(none)"}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <div className="text-xs text-[#8ea0b8]">intent (top)</div>
                    <div className="flex flex-wrap gap-2">
                      {topIntents(activeTurn.meta, 8).map((x) => (
                        <span
                          key={x.label}
                          className="text-xs px-2 py-1 rounded-full border border-[#1f2835] bg-[#0b1118]"
                        >
                          {x.label}: {x.score.toFixed(2)}
                        </span>
                      ))}
                      {topIntents(activeTurn.meta, 8).length === 0 && (
                        <span className="text-xs text-[#8ea0b8]">none</span>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <div className="text-xs text-[#8ea0b8]">telemetry</div>
                    {(() => {
                      const t = getTelemetry(activeTurn.meta);
                      return (
                        <div className="grid grid-cols-5 gap-2 text-sm">
                          {(["C", "N", "M", "S", "R"] as const).map((k) => (
                            <div
                              key={k}
                              className="rounded-lg border border-[#1f2835] bg-[#0b1118] p-3"
                            >
                              <div className="text-xs text-[#8ea0b8]">{k}</div>
                              <div className="mt-1">{t[k].toFixed(2)}</div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="grid gap-2">
                    <div className="text-xs text-[#8ea0b8]">decision_candidates</div>
                    <div className="rounded-lg border border-[#1f2835] bg-[#0b1118] overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs text-[#8ea0b8]">
                          <tr className="border-b border-[#1f2835]">
                            <th className="text-left px-3 py-2">id</th>
                            <th className="text-left px-3 py-2">label</th>
                            <th className="text-right px-3 py-2">score</th>
                            <th className="text-left px-3 py-2">reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getDecisionCandidates(activeTurn.meta).map((c, i) => (
                            <tr key={`${c.id}-${i}`} className="border-b border-[#141b24]">
                              <td className="px-3 py-2 text-xs text-[#c9d2df]">{c.id}</td>
                              <td className="px-3 py-2">{c.label}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {c.score.toFixed(2)}
                              </td>
                              <td className="px-3 py-2 text-xs text-[#c9d2df]">{c.reason}</td>
                            </tr>
                          ))}
                          {getDecisionCandidates(activeTurn.meta).length === 0 && (
                            <tr>
                              <td className="px-3 py-3 text-sm text-[#8ea0b8]" colSpan={4}>
                                none
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <details className="rounded-lg border border-[#1f2835] bg-[#0b1118] p-3">
                    <summary className="cursor-pointer text-sm text-[#c9d2df]">
                      raw meta JSON
                    </summary>
                    <pre className="mt-3 text-xs text-[#c9d2df] whitespace-pre-wrap">
                      {safeJson(getMetaV1(activeTurn.meta))}
                    </pre>
                  </details>
                </>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
