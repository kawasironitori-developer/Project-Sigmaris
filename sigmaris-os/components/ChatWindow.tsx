// /app/components/ChatWindow.tsx
"use client";

import { useState } from "react";
import { requestPersonaDecision, requestSync } from "@/lib/sigmaris-api"; // ★ PersonaOS / AEI Sync API

export default function ChatWindow({
  sessionId,
  initialMessages = [],
}: {
  sessionId: string;
  initialMessages: { role: string; content: string }[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // ------------------------------------------------------------
  // ★ 送信ロジック（PersonaOS → AEI Sync → GPT）
  // ------------------------------------------------------------
  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // =====================================================
      // 1) PersonaOS Decision —「AIはどう応答すべきか？」
      // =====================================================
      const persona = await requestPersonaDecision({
        user: input,
        context: {
          // UI から管理している状態を渡す（簡易版）
          traits: { calm: 0.5, empathy: 0.5, curiosity: 0.5 },
        },
        session_id: sessionId,
        user_id: "u-local", // ★ 本番は Supabase user_id に差し替え
      });

      // persona.decision 内に、AI の推奨スタイル・温度などが入る
      const personaDecision = persona?.decision ?? {};

      // =====================================================
      // 2) AEI Sync — Identity へ反映（任意）
      // =====================================================
      await requestSync({
        chat: { user: input, ai: null },
        context: {
          traits: { calm: 0.5, empathy: 0.5, curiosity: 0.5 },
          safety: null,
          summary: null,
          recent: null,
        },
      });

      // =====================================================
      // 3) GPT生成 — personaDecision を付与
      // =====================================================
      const res = await fetch("/api/aei", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input,
          session_id: sessionId,
          persona: personaDecision, // ← ★ GPTに「PersonaOSの決定」を渡す
        }),
      });

      const data = await res.json();

      if (data?.output) {
        const aiMsg = { role: "ai", content: data.output };
        setMessages((prev) => [...prev, aiMsg]);
      }
    } catch (e) {
      console.error("💥 ChatWindow send error:", e);
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: "⚠️ エラーが発生しました（ログ参照）。",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------------------
  // UI
  // ------------------------------------------------------------
  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto">
      <div className="flex-1 overflow-y-auto space-y-3 p-4 bg-gray-900">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg max-w-[80%] ${
              m.role === "user"
                ? "bg-blue-600 ml-auto text-white"
                : "bg-gray-700 text-gray-100"
            }`}
          >
            {m.content}
          </div>
        ))}

        {loading && (
          <div className="text-gray-400 text-sm animate-pulse">
            Sigmaris is thinking…
          </div>
        )}
      </div>

      <div className="border-t border-gray-700 p-3 flex bg-gray-800">
        <input
          className="flex-1 bg-gray-700 text-gray-100 rounded-lg px-3 py-2 focus:outline-none"
          placeholder="type your message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={loading}
          className="ml-2 bg-blue-600 px-4 py-2 rounded-lg text-white hover:bg-blue-500 transition"
        >
          送信
        </button>
      </div>
    </div>
  );
}
