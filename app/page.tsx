"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ChatList from "@/components/chat/ChatList";
import { useSigmarisChat } from "@/hooks/useSigmarisChat";
import PersonaPanel from "@/components/PersonaPanel";
import ReflectionPanel from "@/components/ReflectionPanel";
import StatePanel from "@/components/StatePanel";
import EunoiaMeter from "@/components/EunoiaMeter";
import { TraitVisualizer } from "@/ui/TraitVisualizer";
import { SafetyIndicator } from "@/ui/SafetyIndicator";
import { EmotionBadge } from "@/ui/EmotionBadge";

export default function Home() {
  // ====== UI制御 ======
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [lang, setLang] = useState<"ja" | "en">("en"); // 🌐 言語トグル
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

  // ====== シグマリスチャットフック ======
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
    metaSummary,
    safetyReport,
    handleSend,
    handleReflect,
    handleNewChat,
    handleSelectChat,
    handleDeleteChat,
    handleRenameChat,
  } = useSigmarisChat();

  // ====== 初回マウント時にチャット作成 ======
  useEffect(() => {
    if (!currentChatId) handleNewChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ====== Smart Send ======
  const handleSmartSend = useCallback(async () => {
    if (!input?.trim()) return;
    let chatId = currentChatId;
    if (!chatId) {
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

  const graphData = [
    {
      time: Date.now(),
      calm: traits.calm,
      empathy: traits.empathy,
      curiosity: traits.curiosity,
    },
  ];

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
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLeft}
              className="px-2 py-1 rounded hover:bg-gray-800"
              aria-label="Toggle chat list"
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
              aria-label="Toggle right panel"
            >
              🧠
            </button>
          </div>
        </header>

        {/* メッセージエリア */}
        <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4 space-y-4">
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

      {/* 右ドロワー（Sigmaris Mind） */}
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

              <div className="flex items-center gap-2">
                {/* 🌐 言語トグルボタン */}
                <button
                  onClick={toggleLang}
                  className="text-xs border border-gray-600 rounded px-2 py-1 hover:bg-gray-800 transition"
                >
                  {lang === "ja" ? "EN" : "JP"}
                </button>

                <button
                  onClick={closeRight}
                  className="lg:hidden text-gray-400"
                  aria-label="Close right panel"
                >
                  ✕
                </button>
              </div>
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

              <PersonaPanel traits={traits} />

              <TraitVisualizer key={graphData.length} data={graphData} />

              {/* ReflectionPanel に言語を渡す */}
              <ReflectionPanel
                reflection={reflectionText}
                metaSummary={metaSummary}
                lang={lang}
              />

              {/* StatePanel にも言語を渡す */}
              <StatePanel
                traits={traits}
                reflection={reflectionText}
                metaReflection={metaSummary}
                safetyFlag={safetyFlag}
                lang={lang}
              />

              <EunoiaMeter traits={traits} safety={safetyReport} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </main>
  );
}
