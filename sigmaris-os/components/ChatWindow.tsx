// /app/chat/components/ChatWindow.tsx
"use client";

import { useState } from "react";

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

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/aei", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input,
          session_id: sessionId, // ← セッション継続
        }),
      });

      const data = await res.json();
      if (data.output) {
        const aiMsg = { role: "ai", content: data.output };
        setMessages((prev) => [...prev, aiMsg]);
      }
    } catch (e) {
      console.error("💥 Send failed:", e);
    } finally {
      setLoading(false);
    }
  };

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
            Sigmaris is thinking...
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
