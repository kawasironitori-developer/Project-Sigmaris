/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 🧩 本番（Vercel）では console.* を削除
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },

  // ✅ Contextなどの動的state更新を正しく反映するための設定
  experimental: {
    reactCompiler: true, // ← React再描画を強制的に有効化
  },
};

export default nextConfig;
