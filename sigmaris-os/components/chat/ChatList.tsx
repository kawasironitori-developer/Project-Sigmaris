"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

interface ChatListProps {
  leftOpen: boolean;
  currentChatId: string | null;
  chats: any[];
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function ChatList({
  leftOpen,
  currentChatId,
  chats,
  onNewChat,
  onSelect,
  onRename,
  onDelete,
  onClose,
}: ChatListProps) {
  const drawerTransition = { type: "tween", duration: 0.28, ease: "easeOut" };

  // 編集中のチャットタイトルを管理
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  return (
    <AnimatePresence>
      {leftOpen && (
        <>
          {/* モバイル用オーバーレイ */}
          <div
            className="fixed inset-0 bg-black/50 lg:hidden z-40"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={drawerTransition}
            className="fixed lg:static z-50 top-0 left-0 h-full w-[280px] bg-[#1a1a1a] border-r border-gray-800 p-4 flex flex-col"
          >
            {/* ヘッダー */}
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Conversation History</h2>
              <button
                onClick={onClose}
                className="lg:hidden text-gray-400 hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            {/* 新規チャット作成ボタン */}
            <button
              onClick={onNewChat}
              className="mt-3 mb-4 w-full px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-sm"
            >
              + New Chat
            </button>

            {/* チャット一覧 */}
            <div className="flex-1 overflow-y-auto space-y-2 text-sm">
              {chats.length === 0 ? (
                <div className="text-gray-500 text-sm px-2">
                  No chats yet. Click "New Chat" to start!
                </div>
              ) : (
                chats.map((c) => (
                  <div
                    key={c.id}
                    className={`group cursor-pointer rounded px-2 py-2 ${
                      currentChatId === c.id
                        ? "bg-blue-700"
                        : "bg-gray-800/60 hover:bg-gray-700/70"
                    }`}
                  >
                    {/* 編集中タイトル入力 */}
                    {editingId === c.id ? (
                      <input
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onBlur={() => {
                          onRename(c.id, newTitle.trim() || c.title);
                          setEditingId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            onRename(c.id, newTitle.trim() || c.title);
                            setEditingId(null);
                          }
                        }}
                        className="w-full text-sm bg-gray-700 rounded px-2 py-1 text-white focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <div
                        className="flex justify-between items-center"
                        onClick={() => {
                          onSelect(c.id);
                          onClose();
                        }}
                      >
                        <div className="flex flex-col w-[85%]">
                          <p className="truncate text-sm font-medium">
                            {c.title}
                          </p>
                          {c.lastMessage && (
                            <p className="truncate text-xs text-gray-400 mt-0.5">
                              {c.lastMessage}
                            </p>
                          )}
                        </div>

                        {/* ✏️🗑 ホバー時に出現 */}
                        <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(c.id);
                              setNewTitle(c.title);
                            }}
                            title="名前を変更"
                            className="text-xs text-gray-400 hover:text-yellow-400"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`「${c.title}」delete this chat?`)) {
                                onDelete(c.id);
                              }
                            }}
                            title="Delete Thread"
                            className="text-xs text-gray-400 hover:text-red-400"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
