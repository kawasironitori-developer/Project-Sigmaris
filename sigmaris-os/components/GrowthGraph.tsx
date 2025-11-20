"use client";
import { useEffect, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface GrowthGraphProps {
  logs: {
    calm: number;
    empathy: number;
    curiosity: number;
    timestamp: string;
  }[];
}

export default function GrowthGraph({ logs }: GrowthGraphProps) {
  const dataRef = useRef(logs);

  useEffect(() => {
    dataRef.current = logs;
  }, [logs]);

  return (
    <div className="bg-neutral-900 text-white p-4 rounded-2xl shadow-xl">
      <h2 className="text-lg font-bold mb-3">Growth Timeline</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={logs}>
          <CartesianGrid strokeDasharray="3 3" stroke="#444" />
          <XAxis dataKey="timestamp" tick={{ fill: "#ccc" }} />
          <YAxis domain={[0, 1]} tick={{ fill: "#ccc" }} />
          <Tooltip contentStyle={{ backgroundColor: "#222", border: "none" }} />
          <Legend />
          <Line type="monotone" dataKey="calm" stroke="#8ecae6" dot={false} />
          <Line
            type="monotone"
            dataKey="empathy"
            stroke="#ffb703"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="curiosity"
            stroke="#fb8500"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
