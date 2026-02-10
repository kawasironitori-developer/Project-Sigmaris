"use client";

type Props = {
  visible: boolean;
};

export default function FogOverlay({ visible }: Props) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* ベース暗転 */}
      <div className="absolute inset-0 bg-black/30" />

      {/* 霧レイヤー①（奥） */}
      <div
        className="
          absolute inset-[-20%]
          opacity-60
          blur-2xl
          animate-fog-slow
        "
        style={{
          background:
            "radial-gradient(circle at 30% 40%, rgba(255,255,255,0.35), transparent 60%),\
             radial-gradient(circle at 70% 60%, rgba(255,255,255,0.25), transparent 65%),\
             radial-gradient(circle at 50% 80%, rgba(255,255,255,0.2), transparent 70%)",
        }}
      />

      {/* 霧レイヤー②（手前） */}
      <div
        className="
          absolute inset-[-30%]
          opacity-70
          blur-3xl
          animate-fog-fast
        "
        style={{
          background:
            "radial-gradient(circle at 40% 50%, rgba(255,255,255,0.45), transparent 55%),\
             radial-gradient(circle at 60% 40%, rgba(255,255,255,0.3), transparent 60%)",
        }}
      />

      {/* 全体ぼかし（雲中感） */}
      <div className="absolute inset-0 backdrop-blur-lg" />
    </div>
  );
}
