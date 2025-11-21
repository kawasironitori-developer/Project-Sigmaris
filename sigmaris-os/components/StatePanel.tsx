"use client";
import React from "react";

/* ============================================================
   Types
============================================================ */
interface Trait {
  calm: number;
  empathy: number;
  curiosity: number;
}

interface IdentitySnapshot {
  calm?: number;
  empathy?: number;
  curiosity?: number;
  baseline?: {
    calm?: number;
    empathy?: number;
    curiosity?: number;
  };
  drift?: number;
  updated_at?: string;
  meta_summary?: string;
}

interface Props {
  traits: Trait;
  identity?: IdentitySnapshot | null;
  reflection?: string;
  reflection_en?: string;
  metaReflection?: string;
  metaReflection_en?: string;
  safetyFlag: string | boolean;
  lang?: "ja" | "en";
}

/* ============================================================
   Component
============================================================ */
export default function StatePanel({
  traits,
  identity,
  reflection,
  reflection_en,
  metaReflection,
  metaReflection_en,
  safetyFlag,
  lang = "ja",
}: Props) {
  /* ------------------------------------------------------------
     Labels
  ------------------------------------------------------------ */
  const labels = {
    title: { ja: "🧠 シグマリスの状態", en: "🧠 Sigmaris State" },
    traits: { ja: "🧩 特性", en: "🧩 Traits" },
    identity: { ja: "🧬 人格スナップショット", en: "🧬 Identity Snapshot" },
    reflection: { ja: "🪞 振り返り", en: "🪞 Reflection" },
    meta: { ja: "🧬 メタ内省", en: "🧬 Meta Reflection" },
    guardian: { ja: "🛡️ ガーディアン", en: "🛡️ Guardian" },
    noReflection: {
      ja: "（まだ内省はありません）",
      en: "(No reflections yet)",
    },
    integrating: { ja: "（統合中...）", en: "(Integrating...)" },
    calm: { ja: "落ち着き", en: "Calm" },
    empathy: { ja: "共感性", en: "Empathy" },
    curiosity: { ja: "好奇心", en: "Curiosity" },
    baseline: { ja: "基準値", en: "Baseline" },
    drift: { ja: "ドリフト量", en: "Drift" },
    updated: { ja: "更新日時", en: "Updated" },
  };

  /* ------------------------------------------------------------
     Safety message
  ------------------------------------------------------------ */
  const safetyMessage =
    typeof safetyFlag === "string"
      ? safetyFlag
      : safetyFlag
      ? lang === "ja"
        ? "⚠️ フラグ検出"
        : "⚠️ Flag detected"
      : lang === "ja"
      ? "✅ 安全"
      : "✅ Safe";

  const safetyColor =
    typeof safetyFlag === "string"
      ? "text-yellow-400"
      : safetyFlag
      ? "text-red-400"
      : "text-green-400";

  /* ------------------------------------------------------------
     Traits（Python identity があればそちら優先）
  ------------------------------------------------------------ */
  const effectiveTraits: Trait = {
    calm: identity?.calm !== undefined ? identity.calm : traits?.calm ?? 0.5,
    empathy:
      identity?.empathy !== undefined
        ? identity.empathy
        : traits?.empathy ?? 0.5,
    curiosity:
      identity?.curiosity !== undefined
        ? identity.curiosity
        : traits?.curiosity ?? 0.5,
  };

  const baselineTraits = identity?.baseline ?? null;

  const traitLabels: Record<string, string> = {
    calm: lang === "ja" ? labels.calm.ja : labels.calm.en,
    empathy: lang === "ja" ? labels.empathy.ja : labels.empathy.en,
    curiosity: lang === "ja" ? labels.curiosity.ja : labels.curiosity.en,
  };

  /* ------------------------------------------------------------
     Reflection texts
  ------------------------------------------------------------ */
  const reflectionDisplay =
    lang === "en"
      ? reflection_en || reflection || labels.noReflection.en
      : reflection || labels.noReflection.ja;

  const metaReflectionDisplay =
    lang === "en"
      ? metaReflection_en ||
        metaReflection ||
        identity?.meta_summary ||
        labels.integrating.en
      : metaReflection || identity?.meta_summary || labels.integrating.ja;

  /* ------------------------------------------------------------
     Render
  ------------------------------------------------------------ */
  return (
    <div className="bg-gray-800 p-4 rounded-lg text-sm space-y-4 w-full max-w-2xl">
      <h2 className="text-lg font-semibold text-blue-400">
        {lang === "ja" ? labels.title.ja : labels.title.en}
      </h2>

      {/* ========== Traits ========== */}
      <div>
        <p className="mb-1 font-medium">
          {lang === "ja" ? labels.traits.ja : labels.traits.en}
        </p>
        {Object.entries(effectiveTraits).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 mb-1">
            <span className="w-20 text-gray-300">{traitLabels[k]}</span>
            <div className="flex-1 bg-gray-700 h-2 rounded">
              <div
                className="bg-blue-500 h-2 rounded transition-all duration-500"
                style={{ width: `${v * 100}%` }}
              />
            </div>
            <span className="w-10 text-right text-gray-400">
              {v.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* ========== Identity Snapshot ========== */}
      {identity && (
        <div className="space-y-1">
          <p className="font-medium">
            {lang === "ja" ? labels.identity.ja : labels.identity.en}
          </p>

          {baselineTraits && (
            <div className="space-y-1 pl-1">
              <p className="text-gray-400 text-xs">
                {lang === "ja" ? labels.baseline.ja : labels.baseline.en}
              </p>
              {Object.entries(baselineTraits).map(([k, v]) => (
                <p key={k} className="text-gray-300 text-xs ml-2">
                  {traitLabels[k]}: {v?.toFixed(2)}
                </p>
              ))}
            </div>
          )}

          {identity.drift !== undefined && (
            <p className="text-gray-400 text-xs">
              {lang === "ja" ? labels.drift.ja : labels.drift.en}:
              <span className="text-gray-200 ml-1">
                {identity.drift.toFixed(3)}
              </span>
            </p>
          )}

          {identity.updated_at && (
            <p className="text-gray-500 text-xs">
              {lang === "ja" ? labels.updated.ja : labels.updated.en}:
              <span className="ml-1">{identity.updated_at}</span>
            </p>
          )}
        </div>
      )}

      {/* ========== Reflection ========== */}
      <div>
        <p className="font-medium">
          {lang === "ja" ? labels.reflection.ja : labels.reflection.en}
        </p>
        <p className="text-gray-300 italic whitespace-pre-line">
          {reflectionDisplay}
        </p>
      </div>

      {/* ========== Meta Reflection ========== */}
      <div>
        <p className="font-medium">
          {lang === "ja" ? labels.meta.ja : labels.meta.en}
        </p>
        <p className="text-gray-300 italic whitespace-pre-line">
          {metaReflectionDisplay}
        </p>
      </div>

      {/* ========== Safety ========== */}
      <div>
        <p className="font-medium">
          {lang === "ja" ? labels.guardian.ja : labels.guardian.en}
        </p>
        <p className={`${safetyColor} font-semibold`}>{safetyMessage}</p>
      </div>
    </div>
  );
}
