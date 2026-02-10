import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Noto_Sans_JP, Shippori_Mincho } from "next/font/google";

const noto = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans",
  display: "swap",
});

const shippori = Shippori_Mincho({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-gensou",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Touhou Talk",
  description: "Character chat UI demo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${noto.variable} ${shippori.variable}`}>
      <body className="min-h-dvh bg-black text-neutral-100 antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
