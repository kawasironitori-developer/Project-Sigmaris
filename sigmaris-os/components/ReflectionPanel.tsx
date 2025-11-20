"use client";

interface ReflectionPanelProps {
  reflection?: string;
  introspection?: string;
  metaSummary?: string;
  lang?: "ja" | "en";
}

export default function ReflectionPanel({
  reflection,
  introspection,
  metaSummary,
  lang = "en",
}: ReflectionPanelProps) {
  // ==== ラベル辞書 ====
  const labels = {
    reflection: {
      ja: "🪞 振り返り",
      en: "🪞 Reflection",
    },
    introspection: {
      ja: "🧠 内省",
      en: "🧠 Introspection",
    },
    meta: {
      ja: "🌌 自己理解（メタ内省）",
      en: "🌌 Meta-Reflection",
    },
    noRecord: {
      ja: "（まだ記録はありません）",
      en: "(No records yet)",
    },
  };

  // ==== セクション構成 ====
  const sections = [
    {
      label: lang === "ja" ? labels.reflection.ja : labels.reflection.en,
      text: reflection,
      color: "text-blue-300",
    },
    {
      label: lang === "ja" ? labels.introspection.ja : labels.introspection.en,
      text: introspection,
      color: "text-emerald-300",
    },
    {
      label: lang === "ja" ? labels.meta.ja : labels.meta.en,
      text: metaSummary,
      color: "text-purple-300",
    },
  ];

  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow-md space-y-4 leading-relaxed">
      {sections.map((s, i) => (
        <div key={i} className="border-l-4 border-gray-600 pl-3">
          <p className={`font-semibold ${s.color}`}>{s.label}</p>
          <p className="whitespace-pre-wrap text-gray-100 mt-1">
            {s.text && s.text.trim().length > 0
              ? s.text
              : lang === "ja"
              ? labels.noRecord.ja
              : labels.noRecord.en}
          </p>
        </div>
      ))}
    </div>
  );
}
