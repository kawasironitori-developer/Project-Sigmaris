"use client";

import { useEffect, useState } from "react";
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

interface PersonaRow {
  timestamp: string;
  calm: number;
  empathy: number;
  curiosity: number;
  growth: number;
}

export default function PersonaChart() {
  const [data, setData] = useState<PersonaRow[]>([]);

  useEffect(() => {
    fetch("/api/persona/history")
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) setData(res.data);
      });
  }, []);

  if (!data.length)
    return <p className="text-center text-gray-400">Loading data...</p>;

  return (
    <div className="w-full h-96 p-4 bg-neutral-900 rounded-2xl shadow-lg">
      <h2 className="text-white text-lg mb-2">Sigmaris Growth Log</h2>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="timestamp" hide />
          <YAxis domain={[0, 1]} tick={{ fill: "#aaa" }} />
          <Tooltip contentStyle={{ backgroundColor: "#111", border: "none" }} />
          <Legend />
          <Line type="monotone" dataKey="calm" stroke="#3BA4FF" dot={false} />
          <Line
            type="monotone"
            dataKey="empathy"
            stroke="#FF7CCB"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="curiosity"
            stroke="#00FFA3"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="growth"
            stroke="#FFD700"
            dot={false}
            strokeDasharray="5 5"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
