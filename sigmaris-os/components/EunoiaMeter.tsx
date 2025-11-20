"use client";
import React from "react";
import { motion } from "framer-motion";
import { deriveEunoiaState } from "@/lib/eunoia";
import type { SafetyReport } from "@/engine/safety/SafetyLayer";
import Pulse from "@/components/Pulse"; // ★ 追加

interface Props {
  traits: {
    calm: number;
    empathy: number;
    curiosity: number;
  };
  safety?: SafetyReport;
}

export default function EunoiaMeter({ traits, safety }: Props) {
  // Eunoia Core から感情トーン算出
  const eunoia = deriveEunoiaState(traits);

  // Safety.action に基づく背景色
  const safetyColor =
    safety?.action === "halt"
      ? "#ef4444"
      : safety?.action === "rewrite-soft"
      ? "#f59e0b"
      : "#10b981";

  // トーン色
  const color =
    traits.empathy > 0.7
      ? "#ff9bd2"
      : traits.calm > 0.7
      ? "#8fd1ff"
      : traits.curiosity > 0.7
      ? "#f5e26b"
      : "#9b9b9b";

  return (
    <motion.div
      className="w-full max-w-2xl p-4 rounded-lg mt-6"
      style={{
        background: `linear-gradient(135deg, ${eunoia.color}, ${safetyColor}30)`,
        boxShadow: `0 0 15px ${color}40`,
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2 className="text-lg font-semibold text-blue-400 mb-2 flex items-center gap-2">
        💞 Eunoia Meter
        <Pulse /> {/* ★ 追加 */}
      </h2>

      {/* 感情バー */}
      <div className="space-y-3">
        {Object.entries(traits).map(([k, v]) => (
          <div key={k}>
            <div className="flex justify-between text-sm text-gray-300">
              <span>{k}</span>
              <span>{(v * 100).toFixed(0)}%</span>
            </div>

            <div className="w-full bg-gray-700 rounded h-2 overflow-hidden">
              <motion.div
                className="h-2 rounded"
                initial={{ width: 0 }}
                animate={{
                  width: `${v * 100}%`,
                  backgroundColor:
                    k === "calm"
                      ? "#8fd1ff"
                      : k === "empathy"
                      ? "#ff9bd2"
                      : "#f5e26b",
                }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* SafetyReport 表示 */}
      <div className="mt-4 text-center text-sm text-gray-400 space-y-1">
        <div>
          Current Tone：
          <span className="font-semibold" style={{ color }}>
            {traits.empathy > 0.7
              ? "優しい"
              : traits.calm > 0.7
              ? "穏やか"
              : traits.curiosity > 0.7
              ? "わくわく"
              : "中立"}
          </span>
          <span className="opacity-70 text-xs ml-1">({eunoia.label})</span>
        </div>

        {safety?.note ? (
          <div className="text-red-300 text-xs">⚠️ {safety.note}</div>
        ) : (
          <div className="text-green-300 text-xs">System stable</div>
        )}
      </div>
    </motion.div>
  );
}
