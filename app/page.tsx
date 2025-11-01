"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import PersonaPanel from "@/components/PersonaPanel";
import GrowthGraph from "@/components/GrowthGraph";
import HistoryPanel from "@/components/HistoryPanel";
import ReflectionPanel from "@/components/ReflectionPanel";
import IntrospectionPanel from "@/components/IntrospectionPanel";

// --- 型定義 ---
interface Message {
  user: string;
  ai: string;
}

interface Trait {
  calm: number;
  empathy: number;
  curiosity: number;
}

export default function Home() {
  // === ステート群 ===
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [traits, setTraits] = useState<Trait>({
    calm: 0.5,
    empathy: 0.5,
    curiosity: 0.5,
  });
  const [growthLog, setGrowthLog] = useState<any[]>([]);
  const [reflectionText, setReflectionText] = useState("");
  const [introspectionText, setIntrospectionText] = useState(""); // 🧠追加
  const [metaSummary, setMetaSummary] = useState(""); // 🪞追加
  const [loading, setLoading] = useState(false);

  // 表示モード
  const [view, setView] = useState<
    "persona" | "graph" | "history" | "reflection" | "introspection"
  >("persona");

  // === メッセージ送信処理 ===
  const handleSend = async () => {
    if (!input.trim()) return;
    const userMessage = input.trim();
    const newMessages = [...messages, { user: userMessage, ai: "..." }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          traits,
          growthLog,
          reflections: messages,
        }),
      });

      const data = await res.json();

      const aiText = data.reply || "……（無応答）";
      const reflection = data.reflection?.text || data.reflection || "";
      const introspection = data.introspection || ""; // 🧠受け取り
      const summary = data.metaSummary || ""; // 🪞受け取り

      // ステート更新
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { user: userMessage, ai: aiText },
      ]);
      setTraits(data.traits || traits);
      setReflectionText(reflection);
      setIntrospectionText(introspection); // 🧠反映
      setMetaSummary(summary); // 🪞反映
      setGrowthLog((prev) => [
        ...prev,
        { ...data.traits, timestamp: new Date().toISOString() },
      ]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { user: userMessage, ai: "（通信エラー）" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-900 text-white p-4 flex flex-col items-center">
      <h1 className="text-2xl font-semibold mb-4">Sigmaris Studio</h1>

      {/* --- チャット表示部 --- */}
      <div className="w-full max-w-2xl mb-4 bg-gray-800 p-4 rounded-lg h-[300px] overflow-y-auto space-y-3">
        {messages.length === 0 && (
          <p className="text-gray-400 text-center">
            ここに会話が表示されます。
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i}>
            <p className="text-blue-400 font-semibold">あなた：</p>
            <p className="mb-2">{m.user}</p>
            <p className="text-pink-400 font-semibold">シグマリス：</p>
            <p className="mb-2">{m.ai}</p>
          </div>
        ))}
      </div>

      {/* 入力欄 */}
      <div className="flex gap-2 w-full max-w-2xl mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          className="flex-grow px-3 py-2 rounded bg-gray-800 focus:outline-none"
          placeholder="メッセージを入力..."
        />
        <button
          onClick={handleSend}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          Send
        </button>
      </div>

      {/* パネル切替 */}
      <div className="flex gap-2 mb-4">
        {["persona", "graph", "history", "reflection", "introspection"].map(
          (v) => (
            <button
              key={v}
              onClick={() => setView(v as any)}
              className={`px-3 py-1 rounded ${
                view === v ? "bg-blue-600" : "bg-gray-700"
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          )
        )}
      </div>

      {/* パネル描画 */}
      <div className="w-full max-w-2xl">
        <AnimatePresence mode="wait">
          {view === "persona" && (
            <motion.div
              key="persona"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <PersonaPanel traits={traits} />
            </motion.div>
          )}

          {view === "graph" && (
            <motion.div
              key="graph"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <GrowthGraph logs={growthLog} />
            </motion.div>
          )}

          {view === "history" && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <HistoryPanel messages={messages} />
            </motion.div>
          )}

          {view === "reflection" && (
            <motion.div
              key="reflection"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <ReflectionPanel reflection={reflectionText} />
            </motion.div>
          )}

          {view === "introspection" && (
            <motion.div
              key="introspection"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <IntrospectionPanel
                introspection={introspectionText}
                metaSummary={metaSummary}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
