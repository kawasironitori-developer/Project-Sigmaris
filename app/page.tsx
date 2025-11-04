"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import PersonaPanel from "@/components/PersonaPanel";
import HistoryPanel from "@/components/HistoryPanel";
import ReflectionPanel from "@/components/ReflectionPanel";
import IntrospectionPanel from "@/components/IntrospectionPanel";
import StatePanel from "@/components/StatePanel";
import EunoiaMeter from "@/components/EunoiaMeter";

import { applyEunoiaTone } from "@/lib/eunoia";
import type { SafetyReport } from "@/engine/safety/SafetyLayer";

// --- 可視化層 ---
import { TraitVisualizer } from "@/ui/TraitVisualizer";
import { SafetyIndicator } from "@/ui/SafetyIndicator";
import { EmotionBadge } from "@/ui/EmotionBadge";

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
  const [safetyReport, setSafetyReport] = useState<SafetyReport | undefined>();

  const [view, setView] = useState<
    "persona" | "graph" | "history" | "reflection" | "introspection"
  >("persona");

  // === PersonaDB初期ロード ===
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/persona");
        if (!res.ok) return;
        const data = await res.json();
        if (!data || data.error) return;

        setTraits({
          calm: data.calm ?? 0.5,
          empathy: data.empathy ?? 0.5,
          curiosity: data.curiosity ?? 0.5,
        });

        setReflectionText(data.reflection || "");
        setMetaSummary(data.meta_summary || "");

        setGrowthLog((prev) => [
          ...prev,
          {
            calm: data.calm ?? 0.5,
            empathy: data.empathy ?? 0.5,
            curiosity: data.curiosity ?? 0.5,
            timestamp: data.timestamp,
          },
        ]);
      } catch (err) {
        console.error("DB load failed:", err);
      }
    })();
  }, []);

  // === 状態変更で自動保存 ===
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

  // === メッセージ送信 ===
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

      const aiText = applyEunoiaTone(rawText, {
        tone:
          traits.empathy > 0.7
            ? "friendly"
            : traits.calm > 0.7
            ? "gentle"
            : "neutral",
        empathyLevel: traits.empathy,
      });

      setMessages((prev) => [
        ...prev.slice(0, -1),
        { user: userMessage, ai: aiText },
      ]);

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

  // === Reflect ===
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
      setSafetyReport(data.safety || undefined);
      setView("reflection");

      // ✅ Reflect後にtraitsを履歴として追加
      if (data.traits) {
        setTraits(data.traits);
        setGrowthLog((prev) => [
          ...prev,
          {
            calm: data.traits.calm,
            empathy: data.traits.empathy,
            curiosity: data.traits.curiosity,
            timestamp: new Date().toISOString(),
          },
        ]);
      }

      if (data.introspection) {
        setIntrospectionHistory((prev) => [
          ...prev.slice(-4),
          data.introspection,
        ]);
      }
    } catch (err) {
      console.error("Reflect fetch error:", err);
      setReflectionText("（振り返りエラー）");
    } finally {
      setReflecting(false);
    }
  };

  // === Safety quick flag ===
  const safetyFlag: string | false =
    traits.calm < 0.3 && traits.curiosity > 0.7
      ? "思考過熱"
      : traits.empathy < 0.3 && traits.calm < 0.3
      ? "情動低下"
      : traits.calm > 0.9 && traits.empathy > 0.9
      ? "過安定（感情変化が鈍化）"
      : false;

  // === Emotion tone color ===
  const toneColor =
    traits.empathy > 0.7 ? "#FFD2A0" : traits.calm > 0.7 ? "#A0E4FF" : "#AAA";

  // === グラフ用データ ===（★修正）
  const graphData = growthLog.map((g, i) => ({
    time: g.timestamp ? new Date(g.timestamp).getTime() : Date.now(),
    calm: g.calm ?? traits.calm,
    empathy: g.empathy ?? traits.empathy,
    curiosity: g.curiosity ?? traits.curiosity,
  }));

  // === JSX ===
  return (
    <main className="min-h-screen bg-gray-900 text-white p-4 flex flex-col items-center">
      <h1 className="text-2xl font-semibold mb-2">Sigmaris Studio</h1>
      <p className="text-gray-400 text-sm mb-4">
        Model in use:{" "}
        <span className="text-blue-400 font-mono">{modelUsed}</span>
      </p>

      <EmotionBadge tone="Current Tone" color={toneColor} />

      {/* === チャット === */}
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

      {/* === パネル描画 === */}
      <div className="w-full max-w-2xl">
        <AnimatePresence mode="wait">
          {view === "persona" && (
            <motion.div
              key="persona"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <PersonaPanel traits={traits} />
            </motion.div>
          )}
          {view === "graph" && (
            <motion.div
              key="graph"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <TraitVisualizer key={graphData.length} data={graphData} />
            </motion.div>
          )}
          {view === "history" && (
            <motion.div
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <HistoryPanel messages={messages} />
            </motion.div>
          )}
          {view === "reflection" && (
            <motion.div
              key="reflection"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <IntrospectionPanel
                introspection={introspectionText}
                metaSummary={metaSummary}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-6">
        <SafetyIndicator
          message={safetyFlag ? safetyFlag : "Stable"}
          level={safetyFlag ? "notice" : "ok"}
        />
      </div>

      <div className="mt-6">
        <StatePanel
          traits={traits}
          reflection={reflectionText}
          metaReflection={metaSummary}
          safetyFlag={safetyFlag}
        />
      </div>

      <div className="mt-6">
        <EunoiaMeter traits={traits} safety={safetyReport} />
      </div>
    </main>
  );
}
