// components/PersonaPanel.tsx
"use client";
import { Trait } from "@/types/trait";

interface PersonaPanelProps {
  traits: Trait;
}

export default function PersonaPanel({ traits }: PersonaPanelProps) {
  return (
    <div className="bg-gray-800 p-4 rounded-lg text-gray-100 space-y-2">
      <p>落ち着き: {(traits.calm * 100).toFixed(0)}%</p>
      <p>共感性: {(traits.empathy * 100).toFixed(0)}%</p>
      <p>好奇心: {(traits.curiosity * 100).toFixed(0)}%</p>
    </div>
  );
}
