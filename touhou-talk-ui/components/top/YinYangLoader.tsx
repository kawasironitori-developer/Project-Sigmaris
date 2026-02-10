"use client";

import Image from "next/image";

type Props = {
  visible: boolean;
};

export default function YinYangLoader({ visible }: Props) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none">
      {/* =========================
          背景暗転＋霧感
         ========================= */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* =========================
          陰陽玉ローディング（画像回転）
         ========================= */}
      <div className="relative w-32 h-32 sm:w-40 sm:h-40">
        <Image
          src="/top/yinyang.png"
          alt="陰陽玉"
          fill
          priority
          className="
            object-contain
            animate-yinyang-spin
            drop-shadow-[0_0_18px_rgba(255,255,255,0.25)]
            drop-shadow-[0_0_32px_rgba(255,60,60,0.25)]
          "
        />
      </div>
    </div>
  );
}
