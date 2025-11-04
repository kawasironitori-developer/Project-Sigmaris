// /ui/SafetyIndicator.tsx
"use client";

export function SafetyIndicator({
  message,
  level,
}: {
  message?: string;
  level?: "ok" | "notice" | "limit";
}) {
  const color =
    level === "limit"
      ? "bg-red-500"
      : level === "notice"
      ? "bg-yellow-500"
      : "bg-green-500";

  return (
    <div className={`p-3 rounded-xl text-white ${color}`}>
      <strong>Safety:</strong> {message ?? "Stable"}
    </div>
  );
}
