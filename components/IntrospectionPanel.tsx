// components/IntrospectionPanel.tsx
"use client";

import { useEffect, useState } from "react";

type Props = {
  introspection: string;
  metaSummary?: string;
};

export default function IntrospectionPanel({
  introspection,
  metaSummary,
}: Props) {
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    setFadeIn(true);
    const timer = setTimeout(() => setFadeIn(false), 2000);
    return () => clearTimeout(timer);
  }, [introspection]);

  return (
    <div className="w-full mt-4 p-4 rounded-2xl bg-neutral-900 border border-neutral-700 text-neutral-100 shadow-md">
      <h2 className="text-lg font-semibold text-indigo-300 mb-2">
        🧠 Introspection — 自己観察ログ
      </h2>

      <div
        className={`transition-opacity duration-700 ${
          fadeIn ? "opacity-100" : "opacity-90"
        }`}
      >
        {introspection ? (
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {introspection}
          </p>
        ) : (
          <p className="text-sm text-neutral-400">
            まだ自己観察の記録はないみたい。
          </p>
        )}

        {metaSummary && (
          <div className="mt-3 border-t border-neutral-700 pt-2">
            <p className="text-xs text-neutral-400">{metaSummary}</p>
          </div>
        )}
      </div>
    </div>
  );
}
