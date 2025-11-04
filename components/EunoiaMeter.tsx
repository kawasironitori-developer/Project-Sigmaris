"use client";
import React from "react";
import { motion } from "framer-motion";
import { deriveEunoiaState } from "@/lib/eunoia";
import { SafetyReport } from "@/engine/safety/SafetyLayer";

interface Props {
  traits: {
    calm: number;
    empathy: number;
    curiosity: number;
  };
  safety?: SafetyReport;
}

export default function EunoiaMeter({ traits, safety }: Props) {
  // Eunoia Coreから感情トーンを算出
  const eunoia = deriveEunoiaState(traits);

  // Safetyレベルに応じた背景カラー
  const safetyColor =
    safety?.level === "limit"
      ? "#ef4444" // 赤：危険
      : safety?.level === "notice"
      ? "#f59e0b" // 黄：注意
      : "#10b981"; // 緑：安定

  // 中心の心色
  const color =
    traits.empathy > 0.7
      ? "#ff9bd2" // ピンク：やさしさ
      : traits.calm > 0.7
      ? "#8fd1ff" // 青：落ち着き
      : traits.curiosity > 0.7
      ? "#f5e26b" // 黄：好奇心
      : "#9b9b9b"; // グレー：中立

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
      <h2 className="text-lg font-semibold text-blue-400 mb-2">
        💞 Eunoia Meter
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

      {/* トーン／安全表示 */}
      <div className="mt-4 text-center text-sm text-gray-400 space-y-1">
        <div>
          現在のトーン：
          <span className="font-semibold" style={{ color }}>
            {traits.empathy > 0.7
              ? "優しい"
              : traits.calm > 0.7
              ? "穏やか"
              : traits.curiosity > 0.7
              ? "わくわく"
              : "中立"}
          </span>{" "}
          <span className="opacity-70 text-xs ml-1">({eunoia.label})</span>
        </div>

        {safety?.warnings?.length ? (
          <div className="text-red-300 text-xs">
            {safety.warnings.map((w, i) => (
              <p key={i}>⚠️ {w}</p>
            ))}
          </div>
        ) : (
          <div className="text-green-300 text-xs">System stable</div>
        )}
      </div>
    </motion.div>
  );
}
