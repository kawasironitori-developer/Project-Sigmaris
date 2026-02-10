// components/ChatPane.tsx
"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { cn } from "@/lib/utils";

/* =========================
   Types
========================= */

type Message = {
  id: string;
  role: "user" | "ai";
  content: string;

  /** グループ用：誰が喋ったか（親が管理） */
  speakerId?: string;
};

type Character = {
  id: string;
  name: string;
  title: string;
  ui: {
    chatBackground?: string | null;
    placeholder: string;
  };
  color?: {
    accent?: string;
  };
};

/** UIが参照する最小限の GroupContext */
type GroupContext = {
  enabled: boolean;
  label: string;
  participants: Character[];
};

/* =========================
   Props
========================= */

type Props = {
  character: Character;
  messages: Message[];

  /** ★ 契約厳守：文字列のみ */
  onSend: (content: string) => void;
  onAiMessage: (content: string) => void;

  onOpenPanel: () => void;

  mode?: "single" | "group";
  groupContext?: GroupContext | null;
};

/* =========================
   Component
========================= */

export default function ChatPane({
  character,
  messages,
  onSend,
  onAiMessage,
  onOpenPanel,
  mode = "single",
  groupContext,
}: Props) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  /* =========================
     textarea 自動リサイズ
  ========================= */

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  /* =========================
     speaker 解決（表示専用）
  ========================= */

  const speakerMap = useMemo(() => {
    if (mode !== "group" || !groupContext) return null;
    return new Map(groupContext.participants.map((c) => [c.id, c]));
  }, [mode, groupContext]);

  /* =========================
     メッセージ送信
  ========================= */

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const content = input;
    setInput("");
    setIsLoading(true);

    // user 即時反映
    onSend(content);

    try {
      const endpoint = mode === "group" ? "/api/group-chat" : "/api/chat";

      const payload =
        mode === "group"
          ? {
              context: groupContext,
              userMessage: content,
            }
          : {
              characterId: character.id,
              messages: [...messages, { role: "user", content }],
            };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("API request failed");

      /**
       * ★ ChatPane は「文字列」しか扱わない
       * speakerId は親で付与される前提
       */
      const data = await res.json();
      onAiMessage(data.content);
    } catch (error) {
      console.error("[ChatPane] API Error:", error);
      onAiMessage("……少し調子が悪いみたい。また後で話しかけて。");
    } finally {
      setIsLoading(false);
    }
  };

  /* ========================= */

  return (
    <main className="relative z-10 flex flex-1 flex-col overflow-hidden">
      {/* 背景（単体のみ） */}
      {mode === "single" && character.ui.chatBackground && (
        <div
          className="absolute inset-0 -z-10 bg-cover bg-center"
          style={{
            backgroundImage: `url(${character.ui.chatBackground})`,
            filter: "blur(1px) brightness(1.0)",
          }}
        />
      )}

      {/* =========================
          ヘッダー
         ========================= */}
      <header className="relative border-b border-white/10 px-6 py-4 backdrop-blur-md">
        {mode === "single" && character.color?.accent && (
          <div
            className={cn(
              "absolute inset-0 -z-10 bg-gradient-to-br opacity-70",
              character.color.accent
            )}
          />
        )}

        <button
          onClick={onOpenPanel}
          className="lg:hidden absolute right-4 top-4 z-50 rounded-lg px-2 py-1 text-white/80 hover:bg-white/10"
        >
          ☰
        </button>

        <div className="pr-10">
          <h2 className="font-gensou text-lg text-white">
            {mode === "group" ? groupContext?.label : character.name}
          </h2>
          <p className="text-xs text-white/50">
            {mode === "group" ? "グループチャット" : character.title}
          </p>
        </div>
      </header>

      {/* =========================
          チャット
         ========================= */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
        {messages
          .filter((m) => m.id !== "init")
          .map((msg) => {
            const isUser = msg.role === "user";

            const speaker =
              mode === "group" && msg.speakerId && speakerMap
                ? speakerMap.get(msg.speakerId)
                : null;

            return (
              <div
                key={msg.id}
                className={cn(
                  "flex w-full",
                  isUser ? "justify-end" : "justify-start"
                )}
              >
                <div className="max-w-[70%]">
                  {!isUser && mode === "group" && speaker && (
                    <div className="mb-1 text-xs text-white/60">
                      {speaker.name}
                    </div>
                  )}

                  <div
                    className={cn(
                      "gensou-card rounded-2xl px-4 py-3 text-sm leading-relaxed",
                      isUser
                        ? "chat-user rounded-br-none"
                        : "chat-ai rounded-bl-none"
                    )}
                  >
                    {msg.content}
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* =========================
          入力欄
         ========================= */}
      <footer className="border-t border-white/10 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="flex items-end gap-3 rounded-2xl bg-black/40 p-3 shadow-lg">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={character.ui.placeholder}
              disabled={isLoading}
              rows={1}
              className="flex-1 resize-none bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-white/40"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />

            <button
              onClick={sendMessage}
              disabled={isLoading}
              className="shrink-0 rounded-xl bg-white/90 px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white disabled:opacity-50"
            >
              送信
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}
