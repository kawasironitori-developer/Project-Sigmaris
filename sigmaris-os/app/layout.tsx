import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react"; // ← ★追加

// ✅ フォントをApp Router形式で定義（Geist → Inter、Mono → Roboto_Mono）
const inter = Inter({
  variable: "--font-geist-sans", // 旧変数名を維持しておくと既存CSSがそのまま動く
  subsets: ["latin"],
  display: "swap",
});

const robotoMono = Roboto_Mono({
  variable: "--font-geist-mono", // 同上：既存デザイン崩れを防ぐ
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sigmaris Studio",
  description: "AEI Personality OS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${inter.variable} ${robotoMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Analytics /> {/* ← ★Vercel解析タグを追加 */}
      </body>
    </html>
  );
}
