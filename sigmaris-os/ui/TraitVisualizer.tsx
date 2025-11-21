"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Label,
  Scatter,
} from "recharts";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface TraitData {
  time: number; // UNIX timestamp (ms)
  calm: number;
  empathy: number;
  curiosity: number;
  baseline?: {
    calm?: number;
    empathy?: number;
    curiosity?: number;
  };
  source?: "persona-init" | "aei-core" | "identity" | string;
  event?: "meta" | "reward" | "longterm" | null; // AEIイベント
}

export function TraitVisualizer({ data }: { data: TraitData[] }) {
  const sorted = [...data].sort((a, b) => a.time - b.time);
  const last = sorted[sorted.length - 1];
  const baseline = last?.baseline ?? null;

  // ❑ 横スクロール幅
  const chartWidth = Math.max(sorted.length * 90, 600);

  // ❑ 自動スクロール用 ref
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 最新まで自動スクロール
  useEffect(() => {
    if (!scrollRef.current) return;
    requestAnimationFrame(() => {
      scrollRef.current!.scrollLeft = scrollRef.current!.scrollWidth;
    });
  }, [data]);

  // source → 点の色マップ
  const sourceColor: Record<string, string> = {
    "persona-init": "#9AE6B4",
    "aei-core": "#FBD38D",
    identity: "#90CDF4",
    default: "#E2E8F0",
  };

  // event → shape と色
  const eventMarker: Record<string, { fill: string; r: number }> = {
    meta: { fill: "#D53F8C", r: 6 },
    reward: { fill: "#B7791F", r: 6 },
    longterm: { fill: "#38A169", r: 6 },
  };

  return (
    <motion.div
      className="p-4 bg-neutral-900 rounded-2xl shadow-lg"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <h3 className="text-white text-lg mb-3 font-semibold">
        Sigmaris Trait Evolution
      </h3>

      {/* === 横スクロール領域 === */}
      <div
        ref={scrollRef}
        className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 rounded-lg"
      >
        <div style={{ width: chartWidth, minWidth: "600px", height: "300px" }}>
          <LineChart
            width={chartWidth}
            height={300}
            data={sorted}
            margin={{ top: 20, right: 40, left: 10, bottom: 20 }}
          >
            {/* 背景 */}
            <CartesianGrid strokeDasharray="3 3" stroke="#444" />

            {/* === X軸 === */}
            <XAxis
              dataKey="time"
              type="number"
              stroke="#aaa"
              tickFormatter={(t) =>
                new Date(t).toLocaleTimeString("ja-JP", {
                  minute: "2-digit",
                  second: "2-digit",
                })
              }
              tick={{ fill: "#ddd", fontSize: 11 }}
            />

            {/* === Y軸 === */}
            <YAxis
              domain={[0, 1]}
              stroke="#aaa"
              tick={{ fill: "#ddd", fontSize: 11 }}
            />

            {/* === Tooltip === */}
            <Tooltip
              contentStyle={{
                background: "#1f1f1f",
                border: "1px solid #444",
                color: "#fff",
              }}
              formatter={(value: number, key: string, entry) => {
                const source = entry?.payload?.source ?? "—";
                const event = entry?.payload?.event ?? "—";
                return [
                  value.toFixed(3),
                  `${key} (${source}${event !== "—" ? " / " + event : ""})`,
                ];
              }}
              labelFormatter={(label) =>
                new Date(label).toLocaleTimeString("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              }
            />

            {/* === Baseline lines === */}
            {baseline?.calm !== undefined && (
              <ReferenceLine
                y={baseline.calm}
                stroke="#4FD1C5"
                strokeDasharray="4 4"
              />
            )}
            {baseline?.empathy !== undefined && (
              <ReferenceLine
                y={baseline.empathy}
                stroke="#F6AD55"
                strokeDasharray="4 4"
              />
            )}
            {baseline?.curiosity !== undefined && (
              <ReferenceLine
                y={baseline.curiosity}
                stroke="#63B3ED"
                strokeDasharray="4 4"
              />
            )}

            {/* === Main trait lines === */}
            <Line
              type="monotone"
              dataKey="calm"
              stroke="#4FD1C5"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="empathy"
              stroke="#F6AD55"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="curiosity"
              stroke="#63B3ED"
              strokeWidth={2}
              dot={false}
            />

            {/* === Source markers（点）=== */}
            {sorted.map((d, idx) => {
              const color =
                sourceColor[d.source ?? "default"] ?? sourceColor["default"];
              return (
                <Scatter
                  key={idx}
                  data={[d]}
                  fill={color}
                  shape="circle"
                  r={4}
                />
              );
            })}

            {/* === Event markers（Meta/Reward/LongTerm）=== */}
            {sorted.map((d, idx) => {
              if (!d.event) return null;
              const ev = eventMarker[d.event];
              return (
                <Scatter
                  key={`ev-${idx}`}
                  data={[d]}
                  fill={ev.fill}
                  r={ev.r}
                  shape="diamond"
                />
              );
            })}
          </LineChart>
        </div>
      </div>

      <p className="text-gray-400 text-xs mt-2 text-center">
        calm・empathy・curiosity の推移（横スクロール／イベント表示／baseline）
      </p>

      {baseline && (
        <p className="text-gray-500 text-[11px] text-center mt-1">
          baseline: 恒常的な人格値（Identity Core）
        </p>
      )}
    </motion.div>
  );
}
