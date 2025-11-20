// /ui/EmotionBadge.tsx
"use client";

export function EmotionBadge({ tone, color }: { tone: string; color: string }) {
  return (
    <div
      className="px-3 py-1 rounded-full text-sm font-semibold text-white shadow-md"
      style={{ backgroundColor: color }}
    >
      {tone}
    </div>
  );
}
