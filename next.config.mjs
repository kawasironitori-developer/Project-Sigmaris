/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 🧩 本番（Vercel）では console.* を完全削除
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
};

export default nextConfig;
