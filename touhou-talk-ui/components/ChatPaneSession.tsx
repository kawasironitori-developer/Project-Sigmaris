"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { cn } from "@/lib/utils";

/* =========================
   Types
========================= */

type Attachment = {
  name: string;
  size: number;
  type: string;
  previewUrl?: string;
};

type AttachmentDraft = {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  previewUrl?: string;
};

type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
  speakerId?: string;
  attachments?: Attachment[];

  meta?: {
    diff?: string;
    touched_files?: string[];
    next_action?: string;
  } | null;
};

type Character = {
  id: string;
  name: string;
  title: string;
  ui: {
    chatBackground?: string | null;
    placeholder: string;
  };
};

type GroupContext = {
  enabled: boolean;
  label: string;
  participants: Character[];
  ui?: {
    chatBackground?: string;
  };
};

type SendPayload = {
  text: string;
  files: File[];
  attachments?: Attachment[];
};



type Props = {
  character: Character;
  messages: Message[];
  onSend: (payload: SendPayload) => void;
  onOpenPanel: () => void;

  /* ★追加 */
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
  onOpenPanel,

  mode = "single",
  groupContext,
}: Props) {
  /* =========================
     VSCode UI Control
  ========================= */
  
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  /* =========================
     Voice input (Web Speech API)
  ========================= */

  const [voiceMode, setVoiceMode] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const voiceFinalRef = useRef("");
  const autoSendTimerRef = useRef<number | null>(null);
  const lastSendAtRef = useRef(0);
  const pendingSendTextRef = useRef<string | null>(null);
  const lastRestartAtRef = useRef(0);

  const inputRef = useRef(input);
  const voiceModeRef = useRef(voiceMode);
  const onSendRef = useRef(onSend);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);

  const clearAutoSendTimer = () => {
    if (autoSendTimerRef.current != null) {
      window.clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }
    pendingSendTextRef.current = null;
  };

  const getSpeechRecognitionCtor = () => {
    if (typeof window === "undefined") return null;
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognition;
      webkitSpeechRecognition?: new () => SpeechRecognition;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  };

  const createRecognition = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return null;

    const recognition = new Ctor();
    recognitionRef.current = recognition;

    recognition.lang = "ja-JP";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    const startText = inputRef.current.trim();
    voiceFinalRef.current = startText ? startText + " " : "";

    recognition.onstart = () => setListening(true);
    recognition.onend = () => {
      setListening(false);
      clearAutoSendTimer();

      if (voiceModeRef.current) {
        const now = Date.now();
        if (now - lastRestartAtRef.current < 1200) return;
        lastRestartAtRef.current = now;
        window.setTimeout(() => {
          try {
            recognition.start();
          } catch {
            // ignore
          }
        }, 250);
      }
    };
    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      console.warn("[voice] recognition error:", e?.error ?? "unknown");
      setListening(false);
      clearAutoSendTimer();
    };
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      let finalAdded = "";

      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        const alt = r?.[0];
        const t = typeof alt?.transcript === "string" ? alt.transcript : "";
        if (!t) continue;
        if (r.isFinal) finalAdded += t;
        else interim += t;
      }

      if (finalAdded) {
        voiceFinalRef.current =
          (voiceFinalRef.current + finalAdded).replace(/\s+/g, " ").trim() + " ";
      }

      const composed = (voiceFinalRef.current + interim).replace(/\s+/g, " ").trim();
      if (composed) setInput(composed);

      clearAutoSendTimer();
      const MIN_SEND_CHARS = 10;
      const SILENCE_MS = 1800;
      const looksMeaningful =
        composed.length >= MIN_SEND_CHARS &&
        /[ぁ-ん一-龥]/.test(composed) &&
        !/^[ぁ-んァ-ンー\s]+$/.test(composed);

      if (finalAdded && looksMeaningful) {
        pendingSendTextRef.current = composed;
        autoSendTimerRef.current = window.setTimeout(() => {
          const text = (pendingSendTextRef.current ?? "").trim();
          if (!text) return;
          if (!voiceModeRef.current) return;

          const now = Date.now();
          if (now - lastSendAtRef.current < 1500) return;
          lastSendAtRef.current = now;

          onSendRef.current({ text, files: [], attachments: [] });
          setInput("");
          voiceFinalRef.current = "";
          clearAutoSendTimer();
        }, SILENCE_MS);
      }
    };

    return recognition;
  };

  const stopRecognition = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    return () => {
      clearAutoSendTimer();
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!voiceMode) {
      stopRecognition();
      setListening(false);
      clearAutoSendTimer();
      recognitionRef.current = null;
      return;
    }
  }, [voiceMode]);

  /* 添付 */
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [preview, setPreview] = useState<Attachment | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  /* textarea resize */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  /* scroll */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* background */
  const backgroundImage =
    mode === "group"
      ? groupContext?.ui?.chatBackground
      : character.ui.chatBackground;
  /* =========================
     previewUrl 管理
  ========================= */

  useEffect(() => {
    setAttachments((prev) =>
      prev.map((a) => {
        if (a.previewUrl) return a;
        if (!a.type.startsWith("image/")) return a;
        return {
          ...a,
          previewUrl: URL.createObjectURL(a.file),
        };
      })
    );

    return () => {
      attachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments.length]);

  /* =========================
     添付削除
  ========================= */

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* =========================
     送信
  ========================= */

  const sendMessage = () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    const displayAttachments: Attachment[] = attachments.map((a) => ({
      name: a.name,
      size: a.size,
      type: a.type,
      previewUrl: a.previewUrl,
    }));

    onSend({
      text: input,
      files: attachments.map((a) => a.file),
      attachments: displayAttachments,
    });

    setInput("");
    setAttachments([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ========================= */

  return (
    <main className="relative z-10 flex flex-1 flex-col overflow-hidden">
      {backgroundImage && (
        <div
          className="absolute inset-0 -z-10 bg-cover bg-center"
          style={{
            backgroundImage: `url(${backgroundImage})`,
            filter: "blur(1px) brightness(0.95)",
          }}
        />
      )}

      {/* ヘッダー */}
      <header className="relative border-b border-white/10 px-6 py-4 backdrop-blur-md">
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

      {/* チャット */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
        {messages
          .filter((m) => m.id !== "init")
          .map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={cn(
                  "flex w-full",
                  isUser ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "gensou-card rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap flex flex-col gap-2",
                    isUser
                      ? "chat-user rounded-br-none"
                      : "chat-ai rounded-bl-none"
                  )}
                >
                  {msg.content}

                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {msg.attachments.map((a, i) => {
                        const isImage = a.type.startsWith("image/");
                        return (
                          <div
                            key={i}
                            className="h-80 w-80 rounded-lg overflow-hidden border border-white/20 bg-black/40"
                          >
                            {isImage && a.previewUrl ? (
                              <img
                                src={a.previewUrl}
                                className="h-full w-full object-cover"
                                onClick={() => setPreview(a)}
                              />
                            ) : (
                              <div
                                onClick={() => setPreview(a)}
                                className="flex h-full w-full flex-col items-center justify-center text-xs text-white/80 px-1 cursor-pointer"
                              >
                                📎
                                <span className="truncate">{a.name}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        <div ref={bottomRef} />
      </div>

      {/* 入力 */}
      <footer className="border-t border-white/10 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-4">
          {/* 添付プレビュー */}
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((a) => {
                const isImage = a.type.startsWith("image/");
                return (
                  <div
                    key={a.id}
                    className="relative group h-16 w-16 rounded-lg overflow-hidden border border-white/20 bg-black/30"
                  >
                    <button
                      onClick={() =>
                        setPreview({
                          name: a.name,
                          size: a.size,
                          type: a.type,
                          previewUrl: a.previewUrl,
                        })
                      }
                      className="h-full w-full"
                    >
                      {isImage ? (
                        <img
                          src={a.previewUrl}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center text-white/80 text-xs gap-1">
                          📎
                          <span className="px-1 truncate max-w-full">
                            {a.name}
                          </span>
                        </div>
                      )}
                    </button>

                    <button
                      onClick={() => removeAttachment(a.id)}
                      className="absolute top-0 right-0 h-5 w-5 rounded-full bg-black/70 text-white text-xs opacity-0 group-hover:opacity-100 transition"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-end gap-2 rounded-2xl bg-black/40 p-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const list = e.currentTarget.files;
                if (!list) return;

                const drafts: AttachmentDraft[] = Array.from(list).map(
                  (file) => ({
                    id: crypto.randomUUID(),
                    file,
                    name: file.name,
                    size: file.size,
                    type: file.type,
                  })
                );

                setAttachments((prev) => [...prev, ...drafts]);
                e.currentTarget.value = "";
              }}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-10 w-10 rounded-full bg-white/90 text-black text-lg"
            >
              +
            </button>

            <button
              type="button"
              onClick={() => {
                const next = !voiceMode;
                setVoiceMode(next);
                if (!next) {
                  stopRecognition();
                  setListening(false);
                  clearAutoSendTimer();
                  recognitionRef.current = null;
                  return;
                }

                const recog = recognitionRef.current ?? createRecognition();
                if (!recog) {
                  console.warn("[voice] SpeechRecognition not supported in this browser");
                  setVoiceMode(false);
                  return;
                }

                try {
                  recog.start();
                } catch (err) {
                  console.warn("[voice] failed to start recognition:", err);
                  setVoiceMode(false);
                }
              }}
              className={cn(
                "h-10 w-10 rounded-full text-lg transition border",
                voiceMode
                  ? "bg-red-500/80 border-red-200/30 text-white"
                  : "bg-white/10 border-white/15 text-white/90 hover:bg-white/15"
              )}
              title={voiceMode ? "音声入力モード: ON" : "音声入力モード: OFF"}
            >
              {listening ? "●" : "🎤"}
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={1}
              className="flex-1 resize-none bg-transparent px-3 py-2 text-sm text-white outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />

            <button
              onClick={sendMessage}
              className={cn(
                "h-10 w-10 rounded-full text-lg transition",
              )}
            >
              ↑
            </button>
          </div>
        </div>
      </footer>

      {/* プレビューモーダル */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setPreview(null)}
        >
          <div
            className="max-w-[90vw] max-h-[90vh] rounded-xl bg-black/80 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {preview.previewUrl ? (
              <img
                src={preview.previewUrl}
                className="max-h-[80vh] max-w-[80vw] rounded-lg"
              />
            ) : (
              <div className="text-white">
                <p className="text-sm opacity-70">添付ファイル</p>
                <p className="font-mono break-all">{preview.name}</p>
                <p className="text-xs opacity-50">{preview.type}</p>
                <p className="text-xs opacity-50">
                  {(preview.size / 1024).toFixed(1)} KB
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
