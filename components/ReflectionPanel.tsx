"use client";

interface ReflectionPanelProps {
  reflection: string;
}

export default function ReflectionPanel({ reflection }: ReflectionPanelProps) {
  const isEmpty = !reflection || reflection.trim().length === 0;

  return (
    <div className="bg-gray-800 p-5 rounded-lg shadow-lg border border-gray-700 text-gray-100 transition-all duration-300">
      <h2 className="text-lg font-semibold mb-3 text-indigo-400">
        🪞 内省ログ
      </h2>

      {isEmpty ? (
        <p className="text-gray-500 italic">まだ内省の記録はありません。</p>
      ) : (
        <p className="whitespace-pre-line leading-relaxed">{reflection}</p>
      )}
    </div>
  );
}
