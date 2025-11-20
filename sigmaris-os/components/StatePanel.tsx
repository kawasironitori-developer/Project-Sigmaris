"use client";
import React from "react";

interface Trait {
  calm: number;
  empathy: number;
  curiosity: number;
}

interface Props {
  traits: Trait;
  reflection?: string;
  reflection_en?: string;
  metaReflection?: string;
  metaReflection_en?: string;
  safetyFlag: string | boolean;
  lang?: "ja" | "en";
}

export default function StatePanel({
  traits,
  reflection,
  reflection_en,
  metaReflection,
  metaReflection_en,
  safetyFlag,
  lang = "en",
}: Props) {
  // ==== ラベル辞書 ====
  const labels = {
    title: { ja: "🧠 シグマリスの状態", en: "🧠 Sigmaris State" },
    traits: { ja: "🧩 特性", en: "🧩 Traits" },
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
  };

  // ==== Safetyメッセージ ====
  const safetyMessage =
    typeof safetyFlag === "string"
      ? safetyFlag
      : safetyFlag
      ? lang === "ja"
        ? "⚠️ フラグ検出"
        : "⚠️ Flagged content detected"
      : lang === "ja"
      ? "✅ 安全"
      : "✅ Safe";

  const safetyColor =
    typeof safetyFlag === "string"
      ? "text-yellow-400"
      : safetyFlag
      ? "text-red-400"
      : "text-green-400";

  // ==== Traitラベル対応 ====
  const traitLabels: Record<string, string> = {
    calm: lang === "ja" ? labels.calm.ja : labels.calm.en,
    empathy: lang === "ja" ? labels.empathy.ja : labels.empathy.en,
    curiosity: lang === "ja" ? labels.curiosity.ja : labels.curiosity.en,
  };

  // ==== 表示用テキスト ====
  const reflectionDisplay =
    lang === "en"
      ? reflection_en || reflection || labels.noReflection.en
      : reflection || labels.noReflection.ja;

  const metaReflectionDisplay =
    lang === "en"
      ? metaReflection_en || metaReflection || labels.integrating.en
      : metaReflection || labels.integrating.ja;

  return (
    <div className="bg-gray-800 p-4 rounded-lg text-sm space-y-3 w-full max-w-2xl">
      <h2 className="text-lg font-semibold text-blue-400">
        {lang === "ja" ? labels.title.ja : labels.title.en}
      </h2>

      {/* Traits */}
      <div>
        <p className="mb-1">
          {lang === "ja" ? labels.traits.ja : labels.traits.en}
        </p>
        {Object.entries(traits).map(([k, v]) => (
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

      {/* Reflection */}
      <div>
        <p>{lang === "ja" ? labels.reflection.ja : labels.reflection.en}</p>
        <p className="text-gray-300 italic whitespace-pre-line">
          {reflectionDisplay}
        </p>
      </div>

      {/* Meta Reflection */}
      <div>
        <p>{lang === "ja" ? labels.meta.ja : labels.meta.en}</p>
        <p className="text-gray-300 italic whitespace-pre-line">
          {metaReflectionDisplay}
        </p>
      </div>

      {/* Safety */}
      <div>
        <p>{lang === "ja" ? labels.guardian.ja : labels.guardian.en}</p>
        <p className={`${safetyColor} font-semibold`}>{safetyMessage}</p>
      </div>
    </div>
  );
}
