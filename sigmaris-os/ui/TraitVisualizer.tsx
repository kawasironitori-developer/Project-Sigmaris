"use client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";

interface TraitData {
  time: number; // ← timestampを数値に変換したもの
  calm: number;
  empathy: number;
  curiosity: number;
}

export function TraitVisualizer({ data }: { data: TraitData[] }) {
  // データを時系列順に並べ替える（保険）
  const sortedData = [...data].sort((a, b) => a.time - b.time);

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

      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={sortedData}
          margin={{ top: 10, right: 20, left: -10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#444" />

          {/* === X軸は数値扱い === */}
          <XAxis
            dataKey="time"
            stroke="#888"
            type="number"
            domain={["auto", "auto"]}
            tickFormatter={(t) =>
              new Date(t).toLocaleTimeString("ja-JP", {
                minute: "2-digit",
                second: "2-digit",
              })
            }
            tick={{ fill: "#ccc", fontSize: 12 }}
          />

          <YAxis
            domain={[0, 1]}
            stroke="#888"
            tick={{ fill: "#ccc", fontSize: 12 }}
          />

          <Tooltip
            contentStyle={{
              backgroundColor: "#1f1f1f",
              border: "1px solid #333",
              color: "#fff",
            }}
            formatter={(value: number) => value.toFixed(3)}
            labelFormatter={(label) =>
              new Date(label).toLocaleTimeString("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            }
          />

          {/* Calm */}
          <Line
            type="linear"
            dataKey="calm"
            stroke="#4FD1C5"
            strokeWidth={2}
            dot={true}
            connectNulls
            isAnimationActive
            animationDuration={1000}
          />

          {/* Empathy */}
          <Line
            type="linear"
            dataKey="empathy"
            stroke="#F6AD55"
            strokeWidth={2}
            dot={true}
            connectNulls
            isAnimationActive
            animationDuration={1200}
          />

          {/* Curiosity */}
          <Line
            type="linear"
            dataKey="curiosity"
            stroke="#63B3ED"
            strokeWidth={2}
            dot={true}
            connectNulls
            isAnimationActive
            animationDuration={1400}
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="text-gray-400 text-xs mt-2 text-center">
        calm（落ち着き）・empathy（共感）・curiosity（好奇心）の推移
      </p>
    </motion.div>
  );
}
