"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { SigmarisLangProvider } from "@/lib/sigmarisLangContext";
import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TraitTriplet = {
  calm: number;
  empathy: number;
  curiosity: number;
};

type Snapshot = {
  id: number;
  session_id: string | null;
  trace_id: string | null;
  global_state: string | null;
  overload_score: number | null;
  reflective_score: number | null;
  memory_pointer_count: number | null;
  safety_flag: string | null;
  safety_risk_score: number | null;
  value_state: any | null;
  trait_state: any | null;
  meta: any | null;
  created_at: string;
};

type TelemetrySnapshot = {
  id: number;
  session_id: string | null;
  trace_id: string | null;
  scores: any | null;
  ema: any | null;
  flags: any | null;
  reasons: any | null;
  meta: any | null;
  created_at: string;
};

type TemporalIdentitySnapshot = {
  id: number;
  session_id: string | null;
  trace_id: string | null;
  ego_id: string | null;
  state: any | null;
  telemetry: any | null;
  created_at: string;
};

type SubjectivitySnapshot = {
  id: number;
  session_id: string | null;
  trace_id: string | null;
  subjectivity: any | null;
  created_at: string;
};

type FailureSnapshot = {
  id: number;
  session_id: string | null;
  trace_id: string | null;
  failure: any | null;
  created_at: string;
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function num(v: any): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asTraitTriplet(v: any): TraitTriplet | null {
  if (!v || typeof v !== "object") return null;
  const calm = num(v.calm);
  const empathy = num(v.empathy);
  const curiosity = num(v.curiosity);
  if (calm === null || empathy === null || curiosity === null) return null;
  return { calm, empathy, curiosity };
}

function asTelemetryMetric(
  v: any,
  key: "C" | "N" | "M" | "S" | "R"
): number | null {
  if (!v || typeof v !== "object") return null;
  const n = num(v[key]);
  return n === null ? null : Math.max(0, Math.min(1, n));
}

function as01(v: any): number | null {
  const n = num(v);
  return n === null ? null : Math.max(0, Math.min(1, n));
}

export default function StatusPage() {
  return (
    <SigmarisLangProvider>
      <StatusContent />
    </SigmarisLangProvider>
  );
}

function StatusContent() {
  const [latest, setLatest] = useState<Snapshot | null>(null);
  const [series, setSeries] = useState<Snapshot[]>([]);
  const [telLatest, setTelLatest] = useState<TelemetrySnapshot | null>(null);
  const [telSeries, setTelSeries] = useState<TelemetrySnapshot[]>([]);
  const [tidLatest, setTidLatest] = useState<TemporalIdentitySnapshot | null>(
    null
  );
  const [tidSeries, setTidSeries] = useState<TemporalIdentitySnapshot[]>([]);
  const [subjLatest, setSubjLatest] = useState<SubjectivitySnapshot | null>(
    null
  );
  const [subjSeries, setSubjSeries] = useState<SubjectivitySnapshot[]>([]);
  const [failLatest, setFailLatest] = useState<FailureSnapshot | null>(null);
  const [failSeries, setFailSeries] = useState<FailureSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [traitKey, setTraitKey] = useState<"calm" | "empathy" | "curiosity">(
    "calm"
  );
  const [telKey, setTelKey] = useState<"C" | "N" | "M" | "S" | "R">("C");
  const [opMode, setOpMode] = useState<
    "AUTO" | "S0_TOOL" | "S1_PROTO" | "S2_FUNCTIONAL" | "S3_SAFE"
  >("AUTO");
  const [opFreeze, setOpFreeze] = useState(false);
  const [opSaving, setOpSaving] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [a, b, c, d, e, f, g, h, i, j] = await Promise.all([
          fetch("/api/state/latest", { credentials: "include" }).then((r) =>
            r.json()
          ),
          fetch("/api/state/timeseries?limit=60", {
            credentials: "include",
          }).then((r) => r.json()),
          fetch("/api/telemetry/latest", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetch("/api/telemetry/timeseries?limit=120", {
            credentials: "include",
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetch("/api/temporal-identity/latest", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetch("/api/temporal-identity/timeseries?limit=160", {
            credentials: "include",
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetch("/api/subjectivity/latest", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetch("/api/subjectivity/timeseries?limit=200", {
            credentials: "include",
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetch("/api/failure/latest", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetch("/api/failure/timeseries?limit=200", {
            credentials: "include",
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ]);
        setLatest(a?.snapshot ?? null);
        setSeries(b?.snapshots ?? []);
        setTelLatest(c?.snapshot ?? null);
        setTelSeries(d?.snapshots ?? []);
        setTidLatest(e?.snapshot ?? null);
        setTidSeries(f?.snapshots ?? []);
        setSubjLatest(g?.snapshot ?? null);
        setSubjSeries(h?.snapshots ?? []);
        setFailLatest(i?.snapshot ?? null);
        setFailSeries(j?.snapshots ?? []);
      } catch (e) {
        console.error("status load failed:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const chartData = useMemo(() => {
    const rows = (series ?? []).map((s) => {
      const traits = asTraitTriplet(s.trait_state);
      const baseline = asTraitTriplet(s?.meta?.trait?.baseline);

      return {
        t: fmtTime(s.created_at),
        calm: traits?.calm ?? null,
        empathy: traits?.empathy ?? null,
        curiosity: traits?.curiosity ?? null,
        calm_base: baseline?.calm ?? null,
        empathy_base: baseline?.empathy ?? null,
        curiosity_base: baseline?.curiosity ?? null,
        overload: num(s.overload_score) ?? null,
        risk: num(s.safety_risk_score) ?? null,
        memory:
          typeof s.memory_pointer_count === "number" ? s.memory_pointer_count : null,
      };
    });

    const window = 7;
    const roll = (key: "calm" | "empathy" | "curiosity") => {
      const out: (number | null)[] = [];
      for (let i = 0; i < rows.length; i++) {
        let sum = 0;
        let n = 0;
        for (let j = Math.max(0, i - window + 1); j <= i; j++) {
          const v = rows[j][key];
          if (typeof v === "number") {
            sum += v;
            n += 1;
          }
        }
        out.push(n ? sum / n : null);
      }
      return out;
    };

    const calmMa = roll("calm");
    const empathyMa = roll("empathy");
    const curiosityMa = roll("curiosity");

    return rows.map((r, idx) => ({
      ...r,
      calm_ma: calmMa[idx],
      empathy_ma: empathyMa[idx],
      curiosity_ma: curiosityMa[idx],
    }));
  }, [series]);

  const telChartData = useMemo(() => {
    return (telSeries ?? []).map((s) => ({
      t: fmtTime(s.created_at),
      C: asTelemetryMetric(s.scores, "C"),
      N: asTelemetryMetric(s.scores, "N"),
      M: asTelemetryMetric(s.scores, "M"),
      S: asTelemetryMetric(s.scores, "S"),
      R: asTelemetryMetric(s.scores, "R"),
      C_ema: asTelemetryMetric(s.ema, "C"),
      N_ema: asTelemetryMetric(s.ema, "N"),
      M_ema: asTelemetryMetric(s.ema, "M"),
      S_ema: asTelemetryMetric(s.ema, "S"),
      R_ema: asTelemetryMetric(s.ema, "R"),
    }));
  }, [telSeries]);

  const phase2ChartData = useMemo(() => {
    const rows: {
      t: string;
      budget: number | null;
      inertia: number | null;
      subj_conf: number | null;
      f_ema: number | null;
      health: number | null;
      collapse: number | null;
      level: number | null;
    }[] = [];

    const maxLen = Math.max(
      tidSeries?.length ?? 0,
      subjSeries?.length ?? 0,
      failSeries?.length ?? 0
    );

    for (let i = 0; i < maxLen; i++) {
      const tid = tidSeries?.[i] ?? null;
      const subj = subjSeries?.[i] ?? null;
      const fail = failSeries?.[i] ?? null;

      const tIso = tid?.created_at ?? subj?.created_at ?? fail?.created_at ?? null;
      if (!tIso) continue;

      rows.push({
        t: fmtTime(tIso),
        budget: as01(tid?.telemetry?.stability_budget),
        inertia: as01(tid?.telemetry?.inertia),
        subj_conf: as01(subj?.subjectivity?.confidence),
        f_ema: as01(subj?.subjectivity?.f_ema),
        health: as01(fail?.failure?.health_score),
        collapse: as01(fail?.failure?.collapse_risk_score),
        level: typeof fail?.failure?.level === "number" ? fail.failure.level : null,
      });
    }
    return rows;
  }, [tidSeries, subjSeries, failSeries]);

  const latestTraits = asTraitTriplet(latest?.trait_state);
  const latestBaseline = asTraitTriplet(latest?.meta?.trait?.baseline);
  const latestTelScore = asTelemetryMetric(telLatest?.scores, telKey);
  const latestTelEma = asTelemetryMetric(telLatest?.ema, telKey);

  const continuity = latest?.meta?.controller_meta?.continuity ?? null;
  const ego = latest?.meta?.controller_meta?.ego ?? null;
  const guardrail = latest?.meta?.controller_meta?.guardrail ?? null;
  const integration = latest?.meta?.controller_meta?.integration ?? null;

  const continuityConf = num(continuity?.confidence);
  const coherenceScore = num(ego?.coherence_score);
  const noiseLevel = num(ego?.noise_level);
  const guardrailMode =
    typeof guardrail?.mode === "string" ? guardrail.mode : null;
  const disclosures: string[] = Array.isArray(guardrail?.disclosures)
    ? guardrail.disclosures.filter((s: any) => typeof s === "string")
    : [];

  const safetyMode =
    typeof integration?.safety_mode === "string" ? integration.safety_mode : null;
  const subjMode: string | null =
    typeof integration?.subjectivity?.mode === "string"
      ? integration.subjectivity.mode
      : typeof subjLatest?.subjectivity?.mode === "string"
        ? subjLatest.subjectivity.mode
        : null;
  const subjConfidence =
    as01(integration?.subjectivity?.confidence) ??
    as01(subjLatest?.subjectivity?.confidence);
  const healthScore =
    as01(integration?.failure?.health_score) ??
    as01(failLatest?.failure?.health_score);
  const stabilityBudget =
    as01(integration?.temporal_identity?.stability_budget) ??
    as01(tidLatest?.telemetry?.stability_budget);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1a2230] text-[#e6eef4] px-6 md:px-16 py-24">
      <Header />

      <div className="max-w-6xl mx-auto mt-6">
        <Link
          href="/logs"
          className="inline-flex items-center gap-2 rounded-full border border-[#4c7cf7]/60 px-3 py-1 text-xs text-[#e6eef4] hover:bg-[#4c7cf7]/15 transition"
        >
          Logs Export（JSON）
        </Link>
      </div>

      <div className="max-w-6xl mx-auto mt-16 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-[#4c7cf7]">
            Sigmaris 内面状態ダッシュボード
          </h1>
          <p className="text-sm text-[#b9c4d2] mt-2">
            `/persona/chat` の meta から抽出した数値（traits / safety / memory / state）を時系列で表示します。
            点線は baseline（体質）で、0.5 がニュートラルです。
          </p>
        </div>

        {loading ? (
          <div className="text-[#b9c4d2]">Loading...</div>
        ) : !latest ? (
          <div className="text-[#b9c4d2]">
            まだ状態データがありません。チャットを1回実行すると表示されます。
          </div>
        ) : (
          <div className="space-y-4">
            {disclosures.length ? (
              <div className="border border-[#fb7185]/30 bg-[#1a2230]/40 rounded-2xl p-4 text-sm text-[#e6eef4]">
                <div className="font-semibold text-[#fb7185]">Disclosure</div>
                <ul className="list-disc pl-5 mt-2 text-[#c9d2df] space-y-1">
                  {disclosures.slice(0, 3).map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card
                title="Global State"
                value={latest.global_state ?? "-"}
                sub={latest.created_at}
              />
              <Card
                title="Overload"
                value={
                  typeof latest.overload_score === "number"
                    ? latest.overload_score.toFixed(3)
                    : "-"
                }
                sub="overload_score"
              />
              <Card
                title="Safety Risk"
                value={
                  typeof latest.safety_risk_score === "number"
                    ? latest.safety_risk_score.toFixed(3)
                    : "0.000"
                }
                sub={latest.safety_flag ? `flag: ${latest.safety_flag}` : "flag: none"}
              />
              <Card
                title="Memory Pointers"
                value={
                  typeof latest.memory_pointer_count === "number"
                    ? String(latest.memory_pointer_count)
                    : "-"
                }
                sub="selected pointers"
              />
              <Card
                title="Traits (calm)"
                value={latestTraits ? latestTraits.calm.toFixed(3) : "-"}
                sub={
                  latestBaseline ? `baseline: ${latestBaseline.calm.toFixed(3)}` : "state"
                }
              />
              <Card
                title="Traits (empathy)"
                value={latestTraits ? latestTraits.empathy.toFixed(3) : "-"}
                sub={
                  latestBaseline
                    ? `baseline: ${latestBaseline.empathy.toFixed(3)}`
                    : "state"
                }
              />
              <Card
                title="Traits (curiosity)"
                value={latestTraits ? latestTraits.curiosity.toFixed(3) : "-"}
                sub={
                  latestBaseline
                    ? `baseline: ${latestBaseline.curiosity.toFixed(3)}`
                    : "state"
                }
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card
                title="Continuity"
                value={
                  typeof continuityConf === "number"
                    ? continuityConf.toFixed(3)
                    : "-"
                }
                sub="continuity confidence"
              />
              <Card
                title="Coherence"
                value={
                  typeof coherenceScore === "number"
                    ? coherenceScore.toFixed(3)
                    : "-"
                }
                sub="coherence score"
              />
              <Card
                title="Noise"
                value={typeof noiseLevel === "number" ? noiseLevel.toFixed(3) : "-"}
                sub="noise level"
              />
              <Card
                title="Guardrail"
                value={guardrailMode ?? "NORMAL"}
                sub="mode"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
              <Card title="Subjectivity" value={subjMode ?? "-"} sub="S0..S3" />
              <Card
                title="Subjectivity Conf"
                value={typeof subjConfidence === "number" ? subjConfidence.toFixed(3) : "-"}
                sub="confidence"
              />
              <Card
                title="Identity Health"
                value={typeof healthScore === "number" ? healthScore.toFixed(3) : "-"}
                sub="health_score"
              />
              <Card
                title="Stability Budget"
                value={typeof stabilityBudget === "number" ? stabilityBudget.toFixed(3) : "-"}
                sub={safetyMode ? `safety_mode=${safetyMode}` : "budget"}
              />
            </div>

            <Panel title="Operator (mode override)">
              <div className="text-xs text-[#94a3b8] mb-3">
                運用者が Subjectivity Mode と Freeze を上書きします（監査ログが残ります）。
              </div>
              {opError ? (
                <div className="text-sm text-[#fb7185] mb-3">{opError}</div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs text-[#b9c4d2]">
                  Mode
                  <select
                    className="ml-2 bg-[#0b1220] border border-[#4c7cf7]/25 rounded px-2 py-1 text-[#e6eef4]"
                    value={opMode}
                    onChange={(e) => setOpMode(e.target.value as any)}
                  >
                    <option value="AUTO">AUTO</option>
                    <option value="S0_TOOL">S0_TOOL</option>
                    <option value="S1_PROTO">S1_PROTO</option>
                    <option value="S2_FUNCTIONAL">S2_FUNCTIONAL</option>
                    <option value="S3_SAFE">S3_SAFE</option>
                  </select>
                </label>

                <label className="text-xs text-[#b9c4d2] flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={opFreeze}
                    onChange={(e) => setOpFreeze(e.target.checked)}
                  />
                  Freeze updates
                </label>

                <button
                  type="button"
                  disabled={opSaving}
                  className={[
                    "px-3 py-2 rounded-lg text-xs border transition-colors",
                    opSaving
                      ? "border-[#4c7cf7]/20 bg-[#4c7cf7]/10 text-[#94a3b8]"
                      : "border-[#4c7cf7]/45 bg-[#4c7cf7]/15 text-[#e6eef4] hover:border-[#4c7cf7]/70",
                  ].join(" ")}
                  onClick={async () => {
                    setOpSaving(true);
                    setOpError(null);
                    try {
                      const res = await fetch("/api/operator/override", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({
                          kind: "ops_mode_set",
                          payload: {
                            subjectivity_mode: opMode,
                            freeze_updates: opFreeze,
                          },
                        }),
                      });
                      const json = await res.json().catch(() => null);
                      if (!res.ok) {
                        setOpError(
                          json?.error
                            ? String(json.error)
                            : `operator override failed (${res.status})`
                        );
                      } else {
                        // Refresh state quickly (best-effort)
                        const a = await fetch("/api/state/latest", {
                          credentials: "include",
                        }).then((r) => r.json());
                        setLatest(a?.snapshot ?? null);
                      }
                    } catch (e: any) {
                      setOpError(e?.message ?? String(e));
                    } finally {
                      setOpSaving(false);
                    }
                  }}
                >
                  Apply
                </button>
              </div>
            </Panel>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Traits (time series)">
            <div className="flex flex-wrap gap-2 mb-3">
              <TraitTab
                active={traitKey === "calm"}
                onClick={() => setTraitKey("calm")}
                label="calm"
              />
              <TraitTab
                active={traitKey === "empathy"}
                onClick={() => setTraitKey("empathy")}
                label="empathy"
              />
              <TraitTab
                active={traitKey === "curiosity"}
                onClick={() => setTraitKey("curiosity")}
                label="curiosity"
              />
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="t" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 1]} stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <ReferenceLine y={0.5} stroke="#475569" strokeDasharray="4 4" />
                  <Tooltip
                    contentStyle={{
                      background: "#0b1220",
                      border: "1px solid rgba(76,124,247,0.25)",
                      color: "#e6eef4",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey={traitKey}
                    stroke={traitKey === "calm" ? "#60a5fa" : traitKey === "empathy" ? "#f59e0b" : "#34d399"}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey={`${traitKey}_ma`}
                    stroke={traitKey === "calm" ? "#60a5fa" : traitKey === "empathy" ? "#f59e0b" : "#34d399"}
                    strokeDasharray="6 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey={`${traitKey}_base`}
                    stroke="#94a3b8"
                    strokeDasharray="2 8"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-[#94a3b8] mt-3">
              実線: state（今） / 点線: 移動平均（7点） / 薄い点線: baseline（体質） / 破線: 0.5（ニュートラル）
            </p>
          </Panel>

          <Panel title="Load / Safety / Memory (time series)">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="t" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#0b1220",
                      border: "1px solid rgba(76,124,247,0.25)",
                      color: "#e6eef4",
                    }}
                  />
                  <Line type="monotone" dataKey="overload" stroke="#a78bfa" dot={false} />
                  <Line type="monotone" dataKey="risk" stroke="#fb7185" dot={false} />
                  <Line type="monotone" dataKey="memory" stroke="#22c55e" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Telemetry (C/N/M/S/R)">
            <div className="flex flex-wrap gap-2 mb-3">
              {(["C", "N", "M", "S", "R"] as const).map((k) => (
                <TraitTab
                  key={k}
                  active={telKey === k}
                  onClick={() => setTelKey(k)}
                  label={k}
                />
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <Card
                title={`Latest ${telKey}`}
                value={latestTelScore === null ? "-" : latestTelScore.toFixed(3)}
                sub="scores"
              />
              <Card
                title={`EMA ${telKey}`}
                value={latestTelEma === null ? "-" : latestTelEma.toFixed(3)}
                sub="ema (smoothed)"
              />
            </div>

            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={telChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="t" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 1]} stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#0b1220",
                      border: "1px solid rgba(76,124,247,0.25)",
                      color: "#e6eef4",
                    }}
                  />
                  <Line type="monotone" dataKey={telKey} stroke="#4c7cf7" dot={false} />
                  <Line
                    type="monotone"
                    dataKey={`${telKey}_ema`}
                    stroke="#4c7cf7"
                    strokeDasharray="6 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-[#94a3b8] mt-3">
              実線=スコア / 破線=EMA。Phase02 定義（C=Coherence, N=Narrativity, M=Memory, S=Self-modeling, R=Responsiveness）です。
            </p>
          </Panel>

          <Panel title="Phase02 (Time / Health)">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={phase2ChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="t" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 1]} stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#0b1220",
                      border: "1px solid rgba(76,124,247,0.25)",
                      color: "#e6eef4",
                    }}
                  />
                  <ReferenceLine y={0.5} stroke="#334155" strokeDasharray="6 6" />
                  <Line type="monotone" dataKey="health" stroke="#34d399" dot={false} />
                  <Line type="monotone" dataKey="budget" stroke="#4c7cf7" dot={false} />
                  <Line
                    type="monotone"
                    dataKey="subj_conf"
                    stroke="#fbbf24"
                    strokeDasharray="6 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="collapse"
                    stroke="#fb7185"
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-[#94a3b8] mt-3">
              health/budget は実線、SubjectivityConfidence/CollapseRisk は点線です。
            </p>
          </Panel>
        </div>
      </div>
    </main>
  );
}

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="border border-[#4c7cf7]/25 rounded-2xl p-5 bg-[#141c26]/40 backdrop-blur-md">
      <div className="text-xs text-[#b9c4d2]">{title}</div>
      <div className="text-2xl font-semibold mt-2">{value}</div>
      {sub && <div className="text-xs text-[#94a3b8] mt-2 break-words">{sub}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-[#4c7cf7]/25 rounded-2xl p-5 bg-[#141c26]/40 backdrop-blur-md">
      <div className="text-sm font-semibold text-[#e6eef4] mb-3">{title}</div>
      {children}
    </div>
  );
}

function TraitTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-3 py-1 rounded-full text-xs border transition-colors",
        active
          ? "border-[#4c7cf7]/60 bg-[#4c7cf7]/15 text-[#e6eef4]"
          : "border-[#4c7cf7]/25 bg-[#141c26]/40 text-[#b9c4d2] hover:border-[#4c7cf7]/45",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
