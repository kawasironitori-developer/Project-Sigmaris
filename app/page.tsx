"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import PersonaPanel from "@/components/PersonaPanel";
import GrowthGraph from "@/components/GrowthGraph";
import HistoryPanel from "@/components/HistoryPanel";
import ReflectionPanel from "@/components/ReflectionPanel";
import IntrospectionPanel from "@/components/IntrospectionPanel";
import StatePanel from "@/components/StatePanel";
import EunoiaMeter from "@/components/EunoiaMeter"; // 💞 追加！

// 🎭 Eunoia Core（感情トーン層）
import { applyEunoiaTone } from "@/lib/eunoia";

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
  const [introspectionText, setIntrospectionText] = useState("");
  const [metaSummary, setMetaSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [introspectionHistory, setIntrospectionHistory] = useState<string[]>(
    []
  );
  const [reflecting, setReflecting] = useState(false);
  const [modelUsed, setModelUsed] = useState("AEI-Lite");

  // 表示モード
  const [view, setView] = useState<
    "persona" | "graph" | "history" | "reflection" | "introspection"
  >("persona");

  // === PersonaDB連携 ===
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/persona");
        if (!res.ok) return;
        const data = await res.json();
        if (!data || data.error) return;

        setTraits({
          calm: data.calm,
          empathy: data.empathy,
          curiosity: data.curiosity,
        });
        setReflectionText(data.reflection || "");
        setMetaSummary(data.meta_summary || "");
        setGrowthLog((prev) => [
          ...prev,
          { weight: data.growth || 0, timestamp: data.timestamp },
        ]);

        console.log("🧠 Persona loaded from DB:", data);
      } catch (err) {
        console.error("DB load failed:", err);
      }
    })();
  }, []);

  // 状態が変化したら自動保存
  useEffect(() => {
    (async () => {
      try {
        await fetch("/api/persona", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            traits,
            reflectionText,
            metaSummary,
            growthWeight: growthLog[growthLog.length - 1]?.weight || 0,
          }),
        });
      } catch (err) {
        console.error("DB save failed:", err);
      }
    })();
  }, [traits, reflectionText, metaSummary, growthLog]);

  // === メッセージ送信処理 ===
  const handleSend = async () => {
    if (!input.trim()) return;
    const userMessage = input.trim();
    const newMessages = [...messages, { user: userMessage, ai: "..." }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/aei", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: userMessage }),
      });

      const data = await res.json();
      const rawText = data.output || "（応答なし）";

      // 🎭 Eunoia Core で“しぐちゃん”トーンに変換
      const aiText = applyEunoiaTone(rawText, {
        tone:
          traits.empathy > 0.7
            ? "friendly"
            : traits.calm > 0.7
            ? "gentle"
            : "neutral",
        empathyLevel: traits.empathy,
      });

      // チャットに反映
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { user: userMessage, ai: aiText },
      ]);

      // 成長記録
      if (data.growth?.weight) {
        setGrowthLog((prev) => [
          ...prev,
          { weight: data.growth.weight, timestamp: new Date().toISOString() },
        ]);
      }

      setModelUsed("AEI-Lite");
      setReflectionText(data.reflection?.text || "");
      setIntrospectionText(data.introspection || "");
      setMetaSummary(data.metaSummary || "");
      if (data.traits) setTraits(data.traits);
    } catch (err) {
      console.error("AEI fetch error:", err);
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { user: userMessage, ai: "（通信エラー）" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // === Reflectボタン ===
  const handleReflect = async () => {
    setReflecting(true);
    try {
      const res = await fetch("/api/reflect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          growthLog,
          history: introspectionHistory,
        }),
      });

      const data = await res.json();
      setReflectionText(data.reflection || "（振り返りなし）");
      setIntrospectionText(data.introspection || "");
      setMetaSummary(data.metaSummary || "");
      setView("reflection");

      if (data.introspection) {
        setIntrospectionHistory((prev) => [
          ...prev.slice(-4),
          data.introspection,
        ]);
      }
    } catch (err) {
      console.error(err);
      setReflectionText("（振り返りエラー）");
    } finally {
      setReflecting(false);
    }
  };

  // === JSX ===
  return (
    <main className="min-h-screen bg-gray-900 text-white p-4 flex flex-col items-center">
      <h1 className="text-2xl font-semibold mb-2">Sigmaris Studio</h1>
      <p className="text-gray-400 text-sm mb-4">
        Model in use:{" "}
        <span className="text-blue-400 font-mono">{modelUsed}</span>
      </p>

      {/* --- チャット --- */}
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
            <p className="mb-2 whitespace-pre-line">{m.ai}</p>
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
          {loading ? "..." : "Send"}
        </button>
        <button
          onClick={handleReflect}
          disabled={reflecting}
          className="px-4 py-2 bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {reflecting ? "Reflecting..." : "Reflect Now"}
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
              <ReflectionPanel
                reflection={reflectionText}
                introspection={introspectionText}
                metaSummary={metaSummary}
              />
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

      {/* === 状態パネル === */}
      <div className="mt-6">
        <StatePanel
          traits={traits}
          reflection={reflectionText}
          metaReflection={metaSummary}
          safetyFlag={false}
        />
      </div>

      {/* === Eunoia Meter（感情可視化） === */}
      <div className="mt-6">
        <EunoiaMeter traits={traits} />
      </div>
    </main>
  );
}
