"use client";
import React from "react";

interface Trait {
  calm: number;
  empathy: number;
  curiosity: number;
}

interface Props {
  traits: Trait;
  reflection: string;
  metaReflection: string;
  safetyFlag: boolean;
}

export default function StatePanel({
  traits,
  reflection,
  metaReflection,
  safetyFlag,
}: Props) {
  return (
    <div className="bg-gray-800 p-4 rounded-lg text-sm space-y-3 w-full max-w-2xl">
      <h2 className="text-lg font-semibold text-blue-400">🧠 Sigmaris State</h2>

      {/* Traits */}
      <div>
        <p>
          🧩 <b>Traits</b>
        </p>
        {Object.entries(traits).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-20 capitalize text-gray-300">{k}</span>
            <div className="flex-1 bg-gray-700 h-2 rounded">
              <div
                className="bg-blue-500 h-2 rounded"
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
        <p>
          🪞 <b>Reflection</b>
        </p>
        <p className="text-gray-300 italic">
          {reflection || "（まだ内省はありません）"}
        </p>
      </div>

      {/* Meta Reflection */}
      <div>
        <p>
          🧬 <b>Meta Reflection</b>
        </p>
        <p className="text-gray-300 italic">
          {metaReflection || "（統合中…）"}
        </p>
      </div>

      {/* Safety */}
      <div>
        <p>
          🛡️ <b>Guardian</b>
        </p>
        <p className={safetyFlag ? "text-red-400" : "text-green-400"}>
          {safetyFlag ? "⚠️ Flagged content detected" : "✅ Safe"}
        </p>
      </div>
    </div>
  );
}
