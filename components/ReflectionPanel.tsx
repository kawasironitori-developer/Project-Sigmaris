"use client";

interface ReflectionPanelProps {
  reflection: string;
  introspection?: string;
  metaSummary?: string;
}

export default function ReflectionPanel({
  reflection,
  introspection,
  metaSummary,
}: ReflectionPanelProps) {
  const sections = [
    {
      label: "🪞 Reflection（振り返り）",
      text: reflection,
      color: "text-blue-300",
    },
    {
      label: "🧠 Introspection（内省）",
      text: introspection,
      color: "text-emerald-300",
    },
    {
      label: "🌌 Meta-Reflection（自己理解）",
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
              : "（まだ記録はありません）"}
          </p>
        </div>
      ))}
    </div>
  );
}
