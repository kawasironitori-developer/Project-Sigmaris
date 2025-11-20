"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import ChatList from "@/components/chat/ChatList";
import { useSigmarisChat } from "@/hooks/useSigmarisChat";
import StatePanel from "@/components/StatePanel";
import { TraitVisualizer } from "@/ui/TraitVisualizer";
import { SafetyIndicator } from "@/ui/SafetyIndicator";
import { EmotionBadge } from "@/ui/EmotionBadge";
import EunoiaMeter from "@/components/EunoiaMeter";
import type { SafetyReport } from "@/types/safety"; // ★ 追加

export default function SigmarisChatPage() {
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [lang, setLang] = useState<"ja" | "en">("en");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);

  // ★ SafetyReport をフロント側でも保持（今はプレースホルダ）
  const [safety, setSafety] = useState<SafetyReport | null>(null);

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

  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const supabase = createClientComponentClient();

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
    handleSend,
    handleReflect,
    handleNewChat,
    handleSelectChat,
    handleDeleteChat,
    handleRenameChat,
  } = useSigmarisChat();

  /** 🪙 クレジット取得 */
  const fetchCredits = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserEmail(user.email ?? "Guest");

    const { data, error } = await supabase
      .from("user_profiles")
      .select("credit_balance")
      .eq("id", user.id)
      .single();

    if (!error && data) setCredits(data.credit_balance);
  }, [supabase]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  useEffect(() => {
    if (!currentChatId) handleNewChat();
  }, [currentChatId, handleNewChat]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** ✉️ 送信処理 */
  const handleSmartSend = useCallback(async () => {
    if (!input?.trim()) return;

    if (!currentChatId) {
      await handleNewChat();
      setTimeout(() => handleSend().then(fetchCredits), 0);
      return;
    }

    handleSend().then(fetchCredits);
  }, [currentChatId, handleNewChat, handleSend, input, fetchCredits]);

  /** 🧠 状態解析（簡易フラグ） */
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

  /** 📈 グラフ追跡 */
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

  // ★ 今はサーバー safety 未連携なので、traits から簡易 SafetyReport を作る（UI 用）
  useEffect(() => {
    const total = traits.calm + traits.empathy + traits.curiosity;

    if (total > 2.65) {
      setSafety({
        flags: {
          selfReference: false,
          abstractionOverload: true,
          loopSuspect: false,
        },
        action: "rewrite-soft",
        note: "感情活動が過剰になっています。処理を一時的に緩めます。",
        suggestMode: "calm-down",
      });
    } else if (total < 0.75) {
      setSafety({
        flags: {
          selfReference: false,
          abstractionOverload: false,
          loopSuspect: false,
        },
        action: "rewrite-soft",
        note: "感情レベルが低下しています。安全に備えて自己調整します。",
        suggestMode: "calm-down",
      });
    } else {
      setSafety({
        flags: {
          selfReference: false,
          abstractionOverload: false,
          loopSuspect: false,
        },
        action: "allow",
        note: "",
        suggestMode: "normal",
      });
    }
  }, [traits.calm, traits.empathy, traits.curiosity]);

  const reflectionForUI =
    lang === "ja" ? reflectionText : reflectionTextEn || reflectionText;
  const metaForUI = lang === "ja" ? metaSummary : metaSummaryEn || metaSummary;

  // =================== UI ===================
  return (
    <main className="h-screen w-full bg-[#0e141b] text-white flex flex-col overflow-hidden">
      {/* 🔹ヘッダー */}
      <header className="sticky top-0 z-50 border-b border-[#4c7cf7]/30 bg-[#0e141b]/95 backdrop-blur-md shadow-sm pt-[env(safe-area-inset-top)]">
        {/* 上段：タイトル */}
        <div className="flex items-center justify-between px-4 lg:px-8 py-2">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-[#4c7cf7]">
              Sigmaris Studio
            </h1>
            <span className="text-xs text-gray-400">
              {lang === "ja"
                ? "対話中AI人格OS"
                : "Interactive AI Personality OS"}
            </span>
          </div>

          <Link
            href="/home"
            className="text-xs border border-[#4c7cf7]/40 rounded px-3 py-1 hover:bg-[#4c7cf7]/10 text-[#c4d0e2] transition"
          >
            {lang === "ja" ? "ホームへ戻る" : "Back to Home"}
          </Link>
        </div>

        {/* 下段：操作群 */}
        <div className="flex flex-wrap items-center justify-center gap-3 px-4 lg:px-8 pb-3">
          <motion.button
            onClick={toggleLeft}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.9 }}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-full w-9 h-9 flex items-center justify-center shadow"
          >
            💬
          </motion.button>

          <motion.button
            onClick={toggleRight}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.9 }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full w-9 h-9 flex items-center justify-center shadow"
          >
            🧠
          </motion.button>

          <button
            onClick={toggleLang}
            className="text-xs border border-gray-600 rounded px-2 py-1 hover:bg-gray-800 transition"
          >
            {lang === "ja" ? "EN" : "JP"}
          </button>

          <span className="text-xs text-yellow-400">
            {credits !== null
              ? `残クレジット: ${credits}`
              : "クレジット取得中..."}
          </span>

          <span className="text-xs text-gray-400">
            {userEmail ? `User: ${userEmail}` : "Guest"}
          </span>

          <span className="text-xs text-gray-400">
            Model: <span className="text-blue-400">{modelUsed}</span>
          </span>
        </div>
      </header>

      {/* === メインエリア === */}
      <div className="flex-1 w-full flex overflow-hidden">
        {/* 左ドロワー */}
        <div className="h-full max-h-[calc(100vh-env(safe-area-inset-bottom))] overflow-y-auto">
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
        </div>

        {/* チャット本体 */}
        <div className="flex-1 flex flex-col min-w-0">
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
              className="h-full max-h-[calc(100vh-env(safe-area-inset-bottom))] overflow-y-auto w-[300px] bg-[#1a1a1a] border-l border-gray-800 p-4 flex-shrink-0"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Sigmaris Mind</h2>
                <button
                  onClick={closeRight}
                  className="lg:hidden text-gray-400"
                  aria-label="Close"
                >
                  ✕
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

                {/* ★ EunoiaMeter：traits + safety（簡易計算版） */}
                <EunoiaMeter traits={traits} safety={safety ?? undefined} />

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
      </div>
    </main>
  );
}
