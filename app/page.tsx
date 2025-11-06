"use client";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

import PersonaPanel from "@/components/PersonaPanel";
import ReflectionPanel from "@/components/ReflectionPanel";
import StatePanel from "@/components/StatePanel";
import EunoiaMeter from "@/components/EunoiaMeter";

import { applyEunoiaTone } from "@/lib/eunoia";
import type { SafetyReport } from "@/engine/safety/SafetyLayer";

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
interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
}

export default function Home() {
  // ===== ステート =====
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [traits, setTraits] = useState<Trait>({
    calm: 0.5,
    empathy: 0.5,
    curiosity: 0.5,
  });
  const [growthLog, setGrowthLog] = useState<any[]>([]);
  const [reflectionText, setReflectionText] = useState("");
  const [metaSummary, setMetaSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [reflecting, setReflecting] = useState(false);
  const [modelUsed, setModelUsed] = useState("AEI-Core");
  const [safetyReport, setSafetyReport] = useState<SafetyReport | undefined>();

  // ===== マルチチャット =====
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  // ===== ドロワー制御 =====
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const toggleLeft = useCallback(() => setLeftOpen((v) => !v), []);
  const toggleRight = useCallback(() => setRightOpen((v) => !v), []);
  const closeLeft = () => setLeftOpen(false);
  const closeRight = () => setRightOpen(false);
  const drawerTransition = { type: "tween", duration: 0.28, ease: "easeOut" };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isMobile = window.matchMedia("(max-width: 1023px)").matches;
      if (isMobile) setRightOpen(false);
    }
  }, []);

  // ===== 新規チャット =====
  const handleNewChat = () => {
    const newId = crypto.randomUUID();
    const newChat: ChatSession = {
      id: newId,
      title: `チャット ${chats.length + 1}`,
      messages: [],
    };
    setChats((prev) => [...prev, newChat]);
    setCurrentChatId(newId);
    setMessages([]);
  };

  // ===== Persona ロード =====
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
        setGrowthLog([
          {
            calm: data.calm ?? 0.5,
            empathy: data.empathy ?? 0.5,
            curiosity: data.curiosity ?? 0.5,
            timestamp: data.updated_at,
          },
        ]);
      } catch (err) {
        console.error("Persona load failed:", err);
      }
    })();
  }, []);

  // ===== AEI メッセージロード =====
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/aei");
        if (!res.ok) return;
        const data = await res.json();
        if (!data.messages?.length) return;

        // ペアリング済み messages を受け取る
        setMessages(data.messages);
      } catch (err) {
        console.error("AEI message load failed:", err);
      }
    })();
  }, []);

  // ===== Persona 自動保存 =====
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
        console.error("Persona save failed:", err);
      }
    })();
  }, [traits, reflectionText, metaSummary, growthLog]);

  // ===== メッセージ送信 =====
  const handleSend = async () => {
    if (!input.trim()) return;
    const userMessage = input.trim();
    const tempMessages = [...messages, { user: userMessage, ai: "..." }];
    setMessages(tempMessages);
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

      const updatedMessages = [
        ...tempMessages.slice(0, -1),
        { user: userMessage, ai: aiText },
      ];
      setMessages(updatedMessages);
      if (data.traits) setTraits(data.traits);
      if (data.reflection) setReflectionText(data.reflection);
      if (data.metaSummary) setMetaSummary(data.metaSummary);

      setModelUsed("AEI-Core");
    } catch (err) {
      console.error("AEI send failed:", err);
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { user: userMessage, ai: "（通信エラー）" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ===== Reflect =====
  const handleReflect = async () => {
    setReflecting(true);
    try {
      const res = await fetch("/api/reflect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, growthLog }),
      });
      const data = await res.json();

      setReflectionText(data.reflection || "（振り返りなし）");
      setMetaSummary(data.metaSummary || "");
      setSafetyReport(data.safety || undefined);
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
    } catch (err) {
      console.error("Reflect failed:", err);
      setReflectionText("（振り返りエラー）");
    } finally {
      setReflecting(false);
    }
  };

  // ===== Safety Flag =====
  const safetyFlag: string | false =
    traits.calm < 0.3 && traits.curiosity > 0.7
      ? "思考過熱"
      : traits.empathy < 0.3 && traits.calm < 0.3
      ? "情動低下"
      : traits.calm > 0.9 && traits.empathy > 0.9
      ? "過安定（感情変化が鈍化）"
      : false;

  const toneColor =
    traits.empathy > 0.7 ? "#FFD2A0" : traits.calm > 0.7 ? "#A0E4FF" : "#AAA";

  const graphData = growthLog.map((g) => ({
    time: g.timestamp ? new Date(g.timestamp).getTime() : Date.now(),
    calm: g.calm ?? traits.calm,
    empathy: g.empathy ?? traits.empathy,
    curiosity: g.curiosity ?? traits.curiosity,
  }));

  // ===== JSX =====
  return (
    <main className="h-screen w-full bg-[#111] text-white overflow-hidden flex">
      {/* 左ドロワー */}
      <AnimatePresence>
        {leftOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/50 lg:hidden z-40"
              onClick={closeLeft}
            />
            <motion.aside
              initial={{ x: -320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={drawerTransition}
              className="fixed lg:static z-50 top-0 left-0 h-full w-[280px] bg-[#1a1a1a] border-r border-gray-800 p-4 flex flex-col"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">チャット</h2>
                <button
                  onClick={closeLeft}
                  className="lg:hidden text-gray-400 hover:text-gray-200"
                >
                  ✕
                </button>
              </div>
              <button
                onClick={handleNewChat}
                className="mt-3 mb-4 w-full px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-sm"
              >
                + 新しいチャット
              </button>
              <div className="flex-1 overflow-y-auto space-y-2 text-sm">
                {chats.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setCurrentChatId(c.id);
                      setMessages(c.messages);
                      closeLeft();
                    }}
                    className={`cursor-pointer rounded px-2 py-2 ${
                      currentChatId === c.id
                        ? "bg-blue-700"
                        : "bg-gray-800/60 hover:bg-gray-700/70"
                    }`}
                  >
                    <p className="truncate text-sm font-medium">{c.title}</p>
                  </div>
                ))}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* 中央チャット */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-4 lg:px-6 py-3 border-b border-gray-800 bg-[#111]">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLeft}
              className="px-2 py-1 rounded hover:bg-gray-800"
            >
              ☰
            </button>
            <h1 className="text-lg font-semibold">Sigmaris Studio</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs text-gray-400">
              Model: <span className="text-blue-400">{modelUsed}</span>
            </span>
            <button
              onClick={toggleRight}
              className="px-2 py-1 rounded hover:bg-gray-800"
            >
              🧠
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4 space-y-4 custom-scroll">
          {messages.length === 0 ? (
            <p className="text-gray-500 text-center mt-20">
              ここに会話が表示されます。
            </p>
          ) : (
            messages.map((m, i) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-end">
                  <div className="max-w-[80%] bg-blue-600 text-white rounded-2xl px-4 py-2 shadow-md whitespace-pre-line">
                    {m.user}
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[80%] bg-gray-800 text-gray-100 rounded-2xl px-4 py-2 shadow-md whitespace-pre-line">
                    {m.ai}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <footer className="border-t border-gray-800 p-3 flex items-center gap-2 bg-[#0d0d0d]">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="メッセージを入力..."
            className="flex-grow bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm disabled:opacity-50"
          >
            {loading ? "..." : "Send"}
          </button>
          <button
            onClick={handleReflect}
            disabled={reflecting}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm disabled:opacity-50"
          >
            {reflecting ? "Reflecting..." : "Reflect"}
          </button>
        </footer>
      </div>

      {/* 右ドロワー */}
      <AnimatePresence>
        {rightOpen && (
          <motion.aside
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={drawerTransition}
            className="fixed lg:static z-50 right-0 h-full w-[300px] bg-[#1a1a1a] border-l border-gray-800 p-4 overflow-y-auto custom-scroll"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Sigmaris Mind</h2>
              <button onClick={closeRight} className="lg:hidden text-gray-400">
                ✕
              </button>
            </div>
            <div className="mt-3">
              <EmotionBadge tone="Current Tone" color={toneColor} />
            </div>
            <div className="mt-4 space-y-6">
              <SafetyIndicator
                message={safetyFlag ? safetyFlag : "Stable"}
                level={safetyFlag ? "notice" : "ok"}
              />
              <PersonaPanel traits={traits} />
              <TraitVisualizer key={graphData.length} data={graphData} />
              <ReflectionPanel
                reflection={reflectionText}
                metaSummary={metaSummary}
              />
              <StatePanel
                traits={traits}
                reflection={reflectionText}
                metaReflection={metaSummary}
                safetyFlag={safetyFlag}
              />
              <EunoiaMeter traits={traits} safety={safetyReport} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </main>
  );
}
