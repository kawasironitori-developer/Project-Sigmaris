"use client";

import { useEffect, useState } from "react";

interface UserPlan {
  plan: string;
  trial_end: string | null;
}

interface Usage {
  aei: number;
  reflect: number;
}

export default function AccountPage() {
  const [user, setUser] = useState<UserPlan | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAccountData() {
      try {
        // --- 課金情報取得 ---
        const res = await fetch("/api/account/info");
        const data = await res.json();

        setUser({
          plan: data.plan,
          trial_end: data.trial_end,
        });

        setUsage({
          aei: data.usage_aei ?? 0,
          reflect: data.usage_reflect ?? 0,
        });
      } catch (err) {
        console.error("⚠️ Account info fetch failed:", err);
      } finally {
        setLoading(false);
      }
    }

    loadAccountData();
  }, []);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        読み込み中...
      </div>
    );

  const trialRemaining = (() => {
    if (!user?.trial_end) return 0;
    const now = new Date();
    const end = new Date(user.trial_end);
    const diff = Math.ceil(
      (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return diff > 0 ? diff : 0;
  })();

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <h1 className="text-3xl font-bold mb-6">👤 アカウント情報</h1>

      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 mb-6">
        <h2 className="text-xl font-semibold mb-3">プラン</h2>
        <p className="text-lg">
          現在のプラン:{" "}
          <span className="text-blue-400 font-semibold">
            {user?.plan ?? "不明"}
          </span>
        </p>
        {user?.plan === "free" && trialRemaining > 0 && (
          <p className="text-gray-400 mt-2">
            試用期間: 残り {trialRemaining} 日
          </p>
        )}
        {user?.plan === "free" && trialRemaining === 0 && (
          <p className="text-red-400 mt-2">
            試用期間は終了しました。アップグレードをご検討ください。
          </p>
        )}
        {user?.plan !== "free" && (
          <p className="text-green-400 mt-2">有料プランが有効です。</p>
        )}

        <button
          onClick={() => (window.location.href = "/dashboard/billing")}
          className="mt-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
        >
          プランを変更する
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
        <h2 className="text-xl font-semibold mb-3">利用状況</h2>
        <ul className="space-y-2 text-gray-300">
          <li>🧠 AI対話（AEI）使用数: {usage?.aei ?? 0}</li>
          <li>🔍 内省（Reflect）使用数: {usage?.reflect ?? 0}</li>
        </ul>
      </div>

      <p className="text-center text-gray-500 text-sm mt-10">
        最終更新: {new Date().toLocaleString()}
      </p>
    </div>
  );
}
