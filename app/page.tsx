"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ChatList from "@/components/chat/ChatList";
import { useSigmarisChat } from "@/hooks/useSigmarisChat";
import StatePanel from "@/components/StatePanel";
import { TraitVisualizer } from "@/ui/TraitVisualizer";
import { SafetyIndicator } from "@/ui/SafetyIndicator";
import { EmotionBadge } from "@/ui/EmotionBadge";

export default function Home() {
  // ====== UI制御 ======
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [lang, setLang] = useState<"ja" | "en">("en");
  const toggleLang = () => setLang((prev) => (prev === "ja" ? "en" : "ja"));

  const toggleLeft = () => setLeftOpen((v) => !v);
  const toggleRight = () => setRightOpen((v) => !v);
  const closeLeft = () => setLeftOpen(false);
  const closeRight = () => setRightOpen(false);

  const drawerTransition = {
    type: "tween" as const,
    duration: 0.28,
    ease: "easeOut",
  };

  // ====== メッセージエリア参照 ======
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  // ====== シグマリスチャット ======
  const {
    chats,
    currentChatId,
    messages,
    input,
    setInput,
    loading,
    reflecting,
    modelUsed,
    traits,
    reflectionText,
    reflectionTextEn,
    metaSummary,
    metaSummaryEn,
    safetyReport,
    handleSend,
    handleReflect,
    handleNewChat,
    handleSelectChat,
    handleDeleteChat,
    handleRenameChat,
  } = useSigmarisChat();

  // ====== 初期化 ======
  useEffect(() => {
    if (!currentChatId) handleNewChat();
  }, [currentChatId, handleNewChat]);

  // ====== メッセージ追加時に自動スクロール ======
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ====== Smart Send ======
  const handleSmartSend = useCallback(async () => {
    if (!input?.trim()) return;
    if (!currentChatId) {
      await handleNewChat();
      setTimeout(() => handleSend(), 0);
      return;
    }
    handleSend();
  }, [currentChatId, handleNewChat, handleSend, input]);

  // ====== Safety Flag ======
  const safetyFlag: string | false =
    traits.calm < 0.3 && traits.curiosity > 0.7
      ? lang === "ja"
        ? "思考過熱"
        : "Overthinking"
      : traits.empathy < 0.3 && traits.calm < 0.3
      ? lang === "ja"
        ? "情動低下"
        : "Emotional Decline"
      : traits.calm > 0.9 && traits.empathy > 0.9
      ? lang === "ja"
        ? "過安定（感情変化が鈍化）"
        : "Overstability (Low Variance)"
      : false;

  const toneColor =
    traits.empathy > 0.7 ? "#FFD2A0" : traits.calm > 0.7 ? "#A0E4FF" : "#AAA";

  // ====== グラフ履歴 ======
  const [graphData, setGraphData] = useState([
    {
      time: Date.now(),
      calm: traits.calm,
      empathy: traits.empathy,
      curiosity: traits.curiosity,
    },
  ]);

  useEffect(() => {
    setGraphData((prev) => {
      const newPoint = {
        time: Date.now(),
        calm: traits.calm,
        empathy: traits.empathy,
        curiosity: traits.curiosity,
      };
      const updated = [...prev, newPoint];
      return updated.length > 50 ? updated.slice(-50) : updated;
    });
  }, [traits.calm, traits.empathy, traits.curiosity]);

  // ====== 言語出し分け ======
  const reflectionForUI =
    lang === "ja" ? reflectionText : reflectionTextEn || reflectionText;
  const metaForUI = lang === "ja" ? metaSummary : metaSummaryEn || metaSummary;

  // ====== UI構成 ======
  return (
    <main className="h-screen w-full bg-[#111] text-white overflow-hidden flex">
      {/* 左ドロワー */}
      <ChatList
        leftOpen={leftOpen}
        currentChatId={currentChatId}
        chats={chats}
        onNewChat={handleNewChat}
        onSelect={handleSelectChat}
        onRename={handleRenameChat}
        onDelete={handleDeleteChat}
        onClose={closeLeft}
      />

      {/* 中央チャット */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-4 lg:px-6 py-3 border-b border-gray-800 bg-[#111]">
          <h1 className="text-lg font-semibold">Sigmaris Studio</h1>
          <span className="hidden sm:block text-xs text-gray-400">
            Model: <span className="text-blue-400">{modelUsed}</span>
          </span>
        </header>

        {/* メッセージエリア */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 lg:px-6 py-4 space-y-4">
          {messages.length === 0 ? (
            <p className="text-gray-500 text-center mt-20">
              {lang === "ja"
                ? "ここに会話が表示されます。"
                : "Your conversation will appear here."}
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
          <div ref={messageEndRef} />
        </div>

        {/* 入力欄 */}
        <footer className="border-t border-gray-800 p-3 flex items-center gap-2 bg-[#0d0d0d]">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSmartSend()}
            placeholder={
              lang === "ja" ? "メッセージを入力..." : "Type your message..."
            }
            className="flex-grow bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSmartSend}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm disabled:opacity-50"
          >
            {loading ? "..." : lang === "ja" ? "送信" : "Send"}
          </button>
          <button
            onClick={handleReflect}
            disabled={reflecting || !currentChatId}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm disabled:opacity-50"
          >
            {reflecting
              ? lang === "ja"
                ? "内省中..."
                : "Reflecting..."
              : lang === "ja"
              ? "内省"
              : "Reflect"}
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
            className="fixed lg:static z-50 right-0 h-full w-[300px] bg-[#1a1a1a] border-l border-gray-800 p-4 overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Sigmaris Mind</h2>
              <button
                onClick={toggleLang}
                className="text-xs border border-gray-600 rounded px-2 py-1 hover:bg-gray-800"
              >
                {lang === "ja" ? "EN" : "JP"}
              </button>
            </div>

            <div className="mt-3">
              <EmotionBadge
                tone={lang === "ja" ? "現在のトーン" : "Current Tone"}
                color={toneColor}
              />
            </div>

            <div className="mt-4 space-y-6">
              <SafetyIndicator
                message={
                  safetyFlag ? safetyFlag : lang === "ja" ? "安定" : "Stable"
                }
                level={safetyFlag ? "notice" : "ok"}
              />
              <TraitVisualizer data={graphData} />
              <StatePanel
                traits={traits}
                reflection={reflectionForUI}
                metaReflection={metaForUI}
                safetyFlag={safetyFlag}
                lang={lang}
              />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* 🌐 フローティングボタン */}
      <motion.button
        onClick={toggleLeft}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="fixed bottom-6 left-6 bg-blue-600 hover:bg-blue-700 text-white text-2xl rounded-full w-12 h-12 shadow-lg flex items-center justify-center"
      >
        💬
      </motion.button>

      <motion.button
        onClick={toggleRight}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="fixed bottom-6 right-6 bg-indigo-600 hover:bg-indigo-700 text-white text-2xl rounded-full w-12 h-12 shadow-lg flex items-center justify-center"
      >
        🪞
      </motion.button>
    </main>
  );
}
