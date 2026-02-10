"use client";

import Image from "next/image";
import FogOverlay from "@/components/top/FogOverlay";
import YinYangLoader from "@/components/top/YinYangLoader";

type Props = {
  children: React.ReactNode;
  fog?: boolean;
  loading?: boolean;
};

export default function TopShell({
  children,
  fog = false,
  loading = false,
}: Props) {
  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {/* 背景動画（PC） */}
      <video
        className="absolute inset-0 hidden h-full object-cover lg:block m-auto"
        src="/top/top-pc.mp4"
        autoPlay
        muted
        playsInline
      />

      {/* 背景イラスト（SP） */}
      <div className="absolute inset-0 lg:hidden">
        <Image
          src="/top/top-sp.png"
          alt="幻想郷"
          fill
          priority
          className="object-cover"
        />
      </div>

      {/* 中央コンテンツ */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6">
        {children}
      </div>

      {/* 演出（必要なページだけONにする） */}
      <FogOverlay visible={fog} />
      <YinYangLoader visible={loading} />
    </main>
  );
}
