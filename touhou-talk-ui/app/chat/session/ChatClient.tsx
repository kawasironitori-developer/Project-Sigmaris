"use client";

import { useSearchParams } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type CompleteAttachment,
  type ExternalStoreAdapter,
} from "@assistant-ui/react";

import { Thread } from "@/components/assistant-ui/thread";
import { TouhouSidebar } from "@/components/assistant-ui/touhou-sidebar";
import { TouhouUiProvider } from "@/components/assistant-ui/touhou-ui-context";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

import { CHARACTERS, getCharacterTtsConfig, isCharacterSelectable } from "@/data/characters";
import { getGroupsByLocation, canEnableGroup, GroupDef } from "@/data/group";
import { getDefaultChatMode } from "@/lib/touhou-settings";

import {
  extractTextFromThreadMessageContent,
  talkMessageToThreadMessageLike,
  TouhouUploadAttachmentAdapter,
  type TalkUiMessage,
} from "@/lib/assistant-ui/touhou-external-store";


/* =========================
   Types
========================= */

type Message = TalkUiMessage;

type SessionSummary = {
  id: string;
  title: string;
  characterId: string;
  mode: "single" | "group";
  layer: string | null;
  location: string | null;
  chatMode: "partner" | "roleplay" | "coach";
};

type PanelGroupContext = {
  enabled: boolean;
  label: string;
  group: GroupDef;
};

type ChatGroupContext = {
  enabled: boolean;
  label: string;
  ui: {
    chatBackground?: string;
    accent?: string;
  };
  participants: Array<{
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
  }>;
};

type VscodeMeta = {
  diff?: string;
  touched_files?: string[];
  next_action?: string;
};

type ChatApiResponse = {
  role?: "ai" | "user";
  content: string;
  meta?: VscodeMeta | null;
  error?: string;
};

type CreateSessionResponse = {
  sessionId: string;
};

type VscodeState =
  | "idle"
  | "analyzing"
  | "diffing"
  | "analysis_done"
  | "diff_ready"
  | "applying"
  | "applied"
  | "error";

/* =========================
   Component
========================= */

export default function ChatClient() {
  const searchParams = useSearchParams();
  const currentLayer = searchParams.get("layer");
  const currentLocationId = searchParams.get("loc");

  /* =========================
     State
  ========================= */

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(
    null,
  );

  const [messagesBySession, setMessagesBySession] = useState<
    Record<string, Message[]>
  >({});

  const [isRunningBySession, setIsRunningBySession] = useState<
    Record<string, boolean>
  >({});

  const appendMessage = useCallback(
    (m: Message) => {
      if (!activeSessionId) return;

      setMessagesBySession((prev) => ({
        ...prev,
        [activeSessionId]: [...(prev[activeSessionId] ?? []), m],
      }));
    },
    [activeSessionId],
  );

  const [mode] = useState<"single" | "group">("single");

  /* =========================
     Local TTS (AquesTalk via /api/tts)
  ========================= */

  const ttsEnabledRef = useRef(true);
  const ttsQueueRef = useRef<string[]>([]);
  const ttsPlayingRef = useRef(false);
  const ttsBufferRef = useRef("");
  const ttsGenerationRef = useRef(0);
  const ttsCurrentAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsConfigByGenRef = useRef(new Map<number, { voice: string; speed: number }>());

  const enqueueTtsChunk = useCallback((chunk: string, gen: number) => {
    const text = chunk.trim();
    if (!text) return;
    if (gen !== ttsGenerationRef.current) return;

    ttsQueueRef.current.push(text);

    if (ttsPlayingRef.current) return;
    ttsPlayingRef.current = true;

    (async () => {
      try {
        while (ttsQueueRef.current.length > 0) {
          if (gen !== ttsGenerationRef.current) break;

          const next = ttsQueueRef.current.shift();
          if (!next) continue;

          const cfg = ttsConfigByGenRef.current.get(gen) ?? { voice: "f1", speed: 100 };
          const r = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: next, voice: cfg.voice, speed: cfg.speed }),
          });
          if (!r.ok) {
            const detail = await r.text().catch(() => "");
            console.warn("[tts] failed:", r.status, detail);
            break;
          }

          const buf = await r.arrayBuffer();
          if (gen !== ttsGenerationRef.current) break;

          const blob = new Blob([buf], { type: "audio/wav" });
          const url = URL.createObjectURL(blob);

          try {
            const audio = new Audio(url);
            ttsCurrentAudioRef.current = audio;

            await new Promise<void>((resolve, reject) => {
              audio.onended = () => resolve();
              audio.onerror = () => reject(new Error("audio error"));
              audio
                .play()
                .then(() => {
                  // ok
                })
                .catch((e) => reject(e));
            });
          } catch (e) {
            console.warn("[tts] playback blocked/failed:", e);
            break;
          } finally {
            ttsCurrentAudioRef.current = null;
            URL.revokeObjectURL(url);
          }
        }
      } finally {
        ttsPlayingRef.current = false;
        ttsQueueRef.current = [];
        ttsBufferRef.current = "";
      }
    })();
  }, []);

  const pushTtsDelta = useCallback(
    (delta: string, gen: number) => {
      if (!ttsEnabledRef.current) return;
      if (!delta) return;
      if (gen !== ttsGenerationRef.current) return;

      ttsBufferRef.current += delta;

      const boundaryChars = ["。", "！", "？", "!", "?", "\n"];
      const takeUntilBoundary = () => {
        const s = ttsBufferRef.current;
        let idx = -1;
        for (let i = 0; i < s.length; i++) {
          if (boundaryChars.includes(s[i] ?? "")) {
            idx = i;
            break;
          }
        }
        if (idx === -1) return null;
        const chunk = s.slice(0, idx + 1);
        ttsBufferRef.current = s.slice(idx + 1);
        return chunk;
      };

      while (true) {
        const chunk = takeUntilBoundary();
        if (!chunk) break;
        enqueueTtsChunk(chunk, gen);
      }

      const maxBuf = 80;
      if (ttsBufferRef.current.length >= maxBuf) {
        const chunk = ttsBufferRef.current.slice(0, maxBuf);
        ttsBufferRef.current = ttsBufferRef.current.slice(maxBuf);
        enqueueTtsChunk(chunk, gen);
      }
    },
    [enqueueTtsChunk],
  );

  const flushTts = useCallback(
    (gen: number) => {
      if (!ttsEnabledRef.current) return;
      if (gen !== ttsGenerationRef.current) return;
      const rest = ttsBufferRef.current.trim();
      ttsBufferRef.current = "";
      if (rest) enqueueTtsChunk(rest, gen);
    },
    [enqueueTtsChunk],
  );

  const autoSelectDoneRef = useRef(false);

  /* =========================
     Mobile UI
  ========================= */

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [hasSelectedOnce, setHasSelectedOnce] = useState(false);
  const [charactersCollapsed, setCharactersCollapsed] = useState(false);

  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 1023px)").matches;
  });

  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  /* =========================
     Active character
  ========================= */

  const activeCharacter = useMemo(() => {
    if (!activeCharacterId) return null;
    return CHARACTERS[activeCharacterId] ?? null;
  }, [activeCharacterId]);

  const effectiveChatBackground = useMemo(() => {
    const ui = activeCharacter?.ui;
    if (!ui) return null;
    const pc = typeof ui.chatBackgroundPC === "string" ? ui.chatBackgroundPC.trim() : "";
    const sp = typeof ui.chatBackgroundSP === "string" ? ui.chatBackgroundSP.trim() : "";
    const legacy = typeof ui.chatBackground === "string" ? ui.chatBackground.trim() : "";

    const preferred = isMobile ? sp || pc : pc || sp;
    return preferred || legacy || null;
  }, [activeCharacter?.ui, isMobile]);

  const [resolvedChatBackground, setResolvedChatBackground] = useState<string | null>(null);

  useEffect(() => {
    const ui = activeCharacter?.ui;
    if (!ui) {
      setResolvedChatBackground(null);
      return;
    }

    const pc = typeof ui.chatBackgroundPC === "string" ? ui.chatBackgroundPC.trim() : "";
    const sp = typeof ui.chatBackgroundSP === "string" ? ui.chatBackgroundSP.trim() : "";
    const legacy = typeof ui.chatBackground === "string" ? ui.chatBackground.trim() : "";

    const preferred = isMobile ? sp || pc : pc || sp;
    const fallback = legacy || null;

    // If no preferred is configured, just use legacy (if any).
    if (!preferred) {
      setResolvedChatBackground(fallback);
      return;
    }

    // Try to load preferred. If it 404s (image not yet added), fall back to legacy.
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setResolvedChatBackground(preferred);
    };
    img.onerror = () => {
      if (cancelled) return;
      setResolvedChatBackground(fallback);
    };
    img.src = preferred;

    return () => {
      cancelled = true;
    };
  }, [activeCharacter?.ui, isMobile]);

  /* =========================
     Character filter
  ========================= */

  const visibleCharacters = useMemo(() => {
    return Object.values(CHARACTERS).filter(
      (c) => isCharacterSelectable(c),
    );
  }, []);

  /* =========================
     Group Context
  ========================= */

  const panelGroupContext = useMemo<PanelGroupContext | null>(() => {
    if (!currentLayer || !currentLocationId) return null;
    const groups = getGroupsByLocation(currentLayer, currentLocationId);
    if (!groups.length) return null;
    const group = groups[0];
    if (!canEnableGroup(group.id)) return null;
    return { enabled: true, label: group.ui.label, group };
  }, [currentLayer, currentLocationId]);

  const chatGroupContext = useMemo<ChatGroupContext | null>(() => {
    if (!panelGroupContext?.enabled) return null;

    const participants = panelGroupContext.group.participants
      .map((id) => CHARACTERS[id])
      .filter((c) => isCharacterSelectable(c));

    const groupUi = panelGroupContext.group.ui as {
      chatBackground?: string | null;
      accent?: string;
    };

    return {
      enabled: true,
      label: panelGroupContext.group.ui.label,
      ui: {
        chatBackground: groupUi.chatBackground ?? undefined,
        accent: groupUi.accent,
      },
      participants,
    };
  }, [panelGroupContext]);

  /* =========================
     Initial session list
  ========================= */

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/session", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { sessions?: SessionSummary[] };
      setSessions(data.sessions ?? []);
      setSessionsLoaded(true); // セッション一覧の取得完了
    })();
  }, []);

  /* =========================
     Character select
  ========================= */

  const selectCharacter = useCallback(
    async (characterId: string) => {
      const existing = sessions.find(
        (s) =>
          s.characterId === characterId &&
          (currentLayer ? s.layer === currentLayer : true) &&
          (currentLocationId ? s.location === currentLocationId : true),
      );
      if (existing) {
        setActiveSessionId(existing.id);
        setActiveCharacterId(characterId); // 既存セッションに切り替え
        setHasSelectedOnce(true);
        setIsPanelOpen(false);
        return;
      }

      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId,
          mode,
          layer: currentLayer,
          location: currentLocationId,
          chatMode: getDefaultChatMode(),
        }),
      });

      if (!res.ok) return;
      const data = (await res.json()) as CreateSessionResponse;

      const newSession: SessionSummary = {
        id: data.sessionId,
        title: "新しい会話",
        characterId,
        mode,
        layer: currentLayer,
        location: currentLocationId,
        chatMode: getDefaultChatMode(),
      };

      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
      setActiveCharacterId(characterId);
      setMessagesBySession((prev) => ({ ...prev, [newSession.id]: [] }));
      setHasSelectedOnce(true);
      setIsPanelOpen(false);
    },
    [sessions, mode, currentLayer, currentLocationId],
  );

  const createSession = useCallback(async () => {
    if (!activeCharacterId) return;

    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        characterId: activeCharacterId,
        mode,
        layer: currentLayer,
        location: currentLocationId,
        chatMode: getDefaultChatMode(),
      }),
    });

    if (!res.ok) return;
    const data = (await res.json()) as CreateSessionResponse;

    const newSession: SessionSummary = {
      id: data.sessionId,
      title: "新しい会話",
      characterId: activeCharacterId,
      mode,
      layer: currentLayer,
      location: currentLocationId,
      chatMode: getDefaultChatMode(),
    };

    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setMessagesBySession((prev) => ({ ...prev, [newSession.id]: [] }));
    setHasSelectedOnce(true);
  }, [activeCharacterId, mode, currentLayer, currentLocationId]);

  /* =========================
   Reset auto select flag when URL char changes
========================= */
  useEffect(() => {
    autoSelectDoneRef.current = false;
  }, [searchParams.get("char")]);
  /* =========================
   Auto select character from URL (map → chat)
 ========================= */
  useEffect(() => {
    if (!sessionsLoaded) return;
    if (autoSelectDoneRef.current) return;

    const charFromUrl = searchParams.get("char");
    if (!charFromUrl) return;
    if (!CHARACTERS[charFromUrl]) return;

    autoSelectDoneRef.current = true;

    // URLの変更直後は状態が競合しやすいので、次のtickで selectCharacter を実行する
    Promise.resolve().then(() => {
      selectCharacter(charFromUrl);
    });
  }, [searchParams, sessionsLoaded, selectCharacter]);
  /* =========================
     Session select / delete / rename
  ========================= */

  const selectSession = useCallback(
    (sessionId: string) => {
      const s = sessions.find((x) => x.id === sessionId);
      if (!s) return;
      setActiveSessionId(s.id);
      setActiveCharacterId(s.characterId);
      setHasSelectedOnce(true);
      setIsPanelOpen(false);
    },
    [sessions],
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/session/${id}`, { method: "DELETE" });
      if (!res.ok) return;

      setSessions((prev) => prev.filter((s) => s.id !== id));
      setMessagesBySession((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      if (activeSessionId === id) {
        setActiveSessionId(null);
        setActiveCharacterId(null);
        setHasSelectedOnce(false);
        setIsPanelOpen(false);
      }
    },
    [activeSessionId],
  );

  const handleRenameSession = useCallback(async (id: string, title: string) => {
    const t = title.trim();
    if (!t) return;

    const res = await fetch(`/api/session/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t }),
    });

    if (!res.ok) return;

    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: t } : s)),
    );
  }, []);

  /* =========================
     Messages restore
  ========================= */

  useEffect(() => {
    if (!activeSessionId) return;
    if (!sessions.some((s) => s.id === activeSessionId)) return;
    if (messagesBySession[activeSessionId]) return;

    (async () => {
      const res = await fetch(`/api/session/${activeSessionId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setMessagesBySession((prev) => ({
        ...prev,
        [activeSessionId]:
          (Array.isArray(data.messages) ? data.messages : []).map((m: any) => ({
            id: String(m.id),
            role: m.role === "user" ? "user" : "ai",
            content: String(m.content ?? ""),
            speakerId:
              typeof m.speaker_id === "string" && m.speaker_id
                ? m.speaker_id
                : undefined,
            attachments: [],
            meta: (m.meta ?? null) as Record<string, unknown> | null,
          })) ?? [],
      }));
    })();
  }, [activeSessionId, sessions, messagesBySession]);

  /* =========================
     Message send
  ========================= */

  const handleSendTalk = useCallback(
    async (payload: {
      text: string;
      files: File[];
      attachments?: CompleteAttachment[];
    }) => {
      if (!activeSessionId || !activeCharacterId) return;

      const { text, files, attachments } = payload;
      const trimmed = String(text ?? "").trim();

      // Slash commands (client-side). Do NOT send to Persona core.
      // - /dump: export logs for the current session (admin-only, enforced server-side)
      if (/^\/dump\b/i.test(trimmed)) {
        appendMessage({
          id: crypto.randomUUID(),
          role: "user",
          content: trimmed,
          attachments: attachments ?? [],
          meta: null,
        });

        const aiId = crypto.randomUUID();
        appendMessage({
          id: aiId,
          role: "ai",
          content: "ログを生成中…",
          speakerId: activeCharacterId,
          attachments: [],
          meta: null,
        });

        try {
          const url = new URL("/api/logs/export", window.location.origin);
          url.searchParams.set("session_id", activeSessionId);
          url.searchParams.set("limit", "2000");

          const r = await fetch(url.toString(), { cache: "no-store" });
          if (!r.ok) {
            const detail = await r.text().catch(() => "");
            throw new Error(`export failed: HTTP ${r.status} ${detail}`);
          }

          const data = (await r.json()) as unknown;
          const ts = new Date().toISOString().replaceAll(":", "-");
          const filename = `touhou-logs_session_${activeSessionId}_${ts}.json`;

          const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
          });
          const dlUrl = URL.createObjectURL(blob);
          try {
            const a = document.createElement("a");
            a.href = dlUrl;
            a.download = filename;
            a.click();
          } finally {
            URL.revokeObjectURL(dlUrl);
          }

          setMessagesBySession((prev) => {
            const list = prev[activeSessionId] ?? [];
            return {
              ...prev,
              [activeSessionId]: list.map((m) =>
                m.id === aiId
                  ? {
                      ...m,
                      content: `ログをダウンロードしました: ${filename}`,
                    }
                  : m
              ),
            };
          });
        } catch (e: any) {
          const msg = e?.message ?? String(e);
          setMessagesBySession((prev) => {
            const list = prev[activeSessionId] ?? [];
            return {
              ...prev,
              [activeSessionId]: list.map((m) =>
                m.id === aiId
                  ? {
                      ...m,
                      content:
                        "ログのダンプに失敗しました。権限（管理者）またはサーバ設定を確認してください。\n" +
                        msg,
                    }
                  : m
              ),
            };
          });
        }

        return;
      }

      setIsRunningBySession((prev) => ({
        ...prev,
        [activeSessionId]: true,
      }));

      try {
        const gen = ++ttsGenerationRef.current;
        ttsQueueRef.current = [];
        ttsBufferRef.current = "";
        ttsConfigByGenRef.current.set(
          gen,
          getCharacterTtsConfig(activeCharacterId),
        );
        try {
          ttsCurrentAudioRef.current?.pause();
        } catch {
          // ignore
        }

        // user message
        appendMessage({
          id: crypto.randomUUID(),
          role: "user",
          content: text,
          attachments: attachments ?? [],
          meta: null,
        });

        // talk endpoint
        const endpoint = `/api/session/${activeSessionId}/message`;

        // talk: FormData に files を詰める
        const form = new FormData();
        form.append("characterId", activeCharacterId);
        form.append("text", text);

        for (const file of files) {
          form.append("files", file);
        }

        // AI placeholder (stream target)
        const aiId = crypto.randomUUID();
        appendMessage({
          id: aiId,
          role: "ai",
          content: "...",
          speakerId: activeCharacterId,
          attachments: [],
          meta: null,
        });

        const res = await fetch(`${endpoint}?stream=1`, {
          method: "POST",
          headers: {
            Accept: "text/event-stream",
          },
          body: form,
        });

        if (!res.ok || !res.body) return;

        const reader = res.body.getReader();

        // ai message
        const decoder = new TextDecoder();
        let buf = "";
        let doneReceived = false;

        const appendDelta = (delta: string) => {
          if (!delta) return;
          pushTtsDelta(delta, gen);
          setMessagesBySession((prev) => {
            const list = prev[activeSessionId] ?? [];
            return {
              ...prev,
              [activeSessionId]: list.map((m) => {
                if (m.id !== aiId) return m;
                const prevText = typeof m.content === "string" ? m.content : "";
                const base = prevText === "..." ? "" : prevText;
                return { ...m, content: base + delta };
              }),
            };
          });
        };

        const finalize = (finalText: string, meta: unknown) => {
          setMessagesBySession((prev) => {
            const list = prev[activeSessionId] ?? [];
            return {
              ...prev,
              [activeSessionId]: list.map((m) =>
                m.id === aiId
                  ? {
                      ...m,
                      content: finalText,
                      meta:
                        meta && typeof meta === "object" && !Array.isArray(meta)
                          ? (meta as Record<string, unknown>)
                          : null,
                    }
                  : m,
              ),
            };
          });
        };

        while (!doneReceived) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          while (true) {
            const idx = buf.indexOf("\n\n");
            if (idx === -1) break;
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            if (!block.trim()) continue;

            const lines = block.split("\n");
            let event = "message";
            const dataLines: string[] = [];
            for (const line of lines) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:"))
                dataLines.push(line.slice(5).trim());
            }
            const dataRaw = dataLines.join("\n");

            if (event === "delta") {
              try {
                const parsed = JSON.parse(dataRaw);
                appendDelta(typeof parsed?.text === "string" ? parsed.text : "");
              } catch {
                appendDelta(dataRaw);
              }
            } else if (event === "done") {
              try {
                const parsed = JSON.parse(dataRaw);
                const reply =
                  typeof parsed?.reply === "string"
                    ? parsed.reply
                    : typeof parsed?.content === "string"
                      ? parsed.content
                      : "";
                const meta = parsed?.meta ?? null;
                flushTts(gen);
                finalize(
                  reply && reply.trim().length > 0
                    ? reply
                    : "（応答生成が一時的に利用できません。）",
                  meta,
                );
              } catch {
                flushTts(gen);
                finalize("（応答生成が一時的に利用できません。）", null);
              }
              doneReceived = true;
              break;
            } else if (event === "error") {
              console.warn("[talk stream error]", dataRaw);
            }
          }
        }
      } finally {
        setIsRunningBySession((prev) => ({
          ...prev,
          [activeSessionId]: false,
        }));
      }
    },
    [
      activeSessionId,
      activeCharacterId,
      appendMessage,
      flushTts,
      pushTtsDelta,
      setMessagesBySession,
    ],
  );

  /* =========================
     Render
  ========================= */

  const activeMessages =
    activeSessionId != null ? (messagesBySession[activeSessionId] ?? []) : [];

  const attachmentAdapter = useMemo(() => new TouhouUploadAttachmentAdapter(), []);

  const store = useMemo<ExternalStoreAdapter<Message>>(
    () => ({
      isDisabled: !activeSessionId || !activeCharacterId,
      isRunning:
        !!activeSessionId && (isRunningBySession[activeSessionId] ?? false),
      isLoading: false,
      messages: activeMessages,
      convertMessage: (m) => talkMessageToThreadMessageLike(m),
      setMessages: undefined,
      onNew: async (message: AppendMessage) => {
        if (!activeSessionId || !activeCharacterId) return;
        if (message.role !== "user") return;

        const text = extractTextFromThreadMessageContent(message.content);
        const auiAttachments = (message.attachments ??
          []) as unknown as CompleteAttachment[];
        const files = auiAttachments
          .map((a) => a.file)
          .filter(Boolean) as File[];

        await handleSendTalk({ text, files, attachments: auiAttachments });
      },
      adapters: {
        attachments: attachmentAdapter,
        threadList: {
          threadId: activeSessionId ?? undefined,
          isLoading: !sessionsLoaded,
          threads: sessions.map((s) => ({
            status: "regular",
            id: s.id,
            remoteId: s.id,
            externalId: s.id,
            title: s.title,
          })),
          archivedThreads: [],
          onSwitchToNewThread: async () => {
            await createSession();
          },
          onSwitchToThread: async (threadId: string) => {
            selectSession(threadId);
          },
          onRename: async (threadId: string, newTitle: string) => {
            await handleRenameSession(threadId, newTitle);
          },
          onDelete: async (threadId: string) => {
            await handleDeleteSession(threadId);
          },
          onArchive: undefined,
          onUnarchive: undefined,
        },
      },
      unstable_capabilities: { copy: true },
      onEdit: undefined,
      onReload: undefined,
      onResume: undefined,
      onCancel: undefined,
    }),
    [
      activeCharacterId,
      activeMessages,
      activeSessionId,
      attachmentAdapter,
      createSession,
      handleDeleteSession,
      handleRenameSession,
      handleSendTalk,
      isRunningBySession,
      selectSession,
      sessions,
      sessionsLoaded,
    ],
  );

  const runtime = useExternalStoreRuntime(store);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport ?? null;

    const update = () => {
      const height = vv?.height ?? window.innerHeight;
      const offsetTop = vv?.offsetTop ?? 0;
      const bottomOcclusion = Math.max(
        0,
        window.innerHeight - (offsetTop + height),
      );
      root.style.setProperty("--app-vvh", `${height}px`);
      root.style.setProperty("--app-vvo", `${offsetTop}px`);
      root.style.setProperty("--app-vvb", `${bottomOcclusion}px`);
    };

    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    if (!mq.matches) return;

    const root = document.documentElement;
    const vv = window.visualViewport ?? null;

    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevWidth = document.body.style.width;
    const prevHeight = document.body.style.height;
    const prevTop = document.body.style.top;
    const prevRootOverflow = root.style.overflow;
    const prevRootHeight = root.style.height;
    const prevOverscroll = root.style.overscrollBehaviorY;

    const scrollY = window.scrollY;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.height = "100%";
    document.body.style.top = `-${scrollY}px`;

    root.style.overflow = "hidden";
    root.style.height = "100%";
    root.style.overscrollBehaviorY = "none";

    const keepTop = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
      if (root.scrollTop !== 0) root.scrollTop = 0;
    };

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const tag = t.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || t.isContentEditable) {
        setTimeout(keepTop, 0);
      }
    };

    keepTop();
    vv?.addEventListener("resize", keepTop);
    vv?.addEventListener("scroll", keepTop);
    window.addEventListener("scroll", keepTop, { passive: true });
    window.addEventListener("focusin", onFocusIn);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.width = prevWidth;
      document.body.style.height = prevHeight;
      document.body.style.top = prevTop;

      root.style.overflow = prevRootOverflow;
      root.style.height = prevRootHeight;
      root.style.overscrollBehaviorY = prevOverscroll;

      vv?.removeEventListener("resize", keepTop);
      vv?.removeEventListener("scroll", keepTop);
      window.removeEventListener("scroll", keepTop);
      window.removeEventListener("focusin", onFocusIn);

      window.scrollTo(0, scrollY);
    };
  }, []);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <TouhouUiProvider
        value={{
          activeSessionId,
          sessions: sessions.map((s) => ({ id: s.id, characterId: s.characterId })),
          characters: CHARACTERS,
        }}
      >
        <SidebarProvider
          style={
            {
              "--sidebar-width": charactersCollapsed ? "19rem" : "32rem",
            } as React.CSSProperties
          }
        >
          <div className="flex h-full w-full min-h-0 overflow-hidden bg-background text-foreground transition-colors duration-300">
            <TouhouSidebar
              visibleCharacters={visibleCharacters}
              activeCharacterId={activeCharacterId}
              onSelectCharacter={selectCharacter}
              charactersCollapsed={charactersCollapsed}
              onCharactersCollapsedChange={setCharactersCollapsed}
            />

            <SidebarInset className="relative flex min-h-0 flex-col overflow-hidden">
              {/* Background */}
              <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-70"
                style={{
                  backgroundImage: (resolvedChatBackground ?? effectiveChatBackground)
                    ? `url('${resolvedChatBackground ?? effectiveChatBackground}')`
                    : undefined,
                  filter: "blur(1px) brightness(0.9)",
                }}
              />

              {/* Header */}
              <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b px-4 bg-background/70 backdrop-blur">
                {activeCharacter?.color?.accent && (
                  <div
                    className={`absolute inset-0 -z-10 bg-gradient-to-br opacity-60 ${activeCharacter.color.accent}`}
                  />
                )}

                <SidebarTrigger />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <div className="min-w-0">
                  <div className="truncate font-gensou text-sm">
                    {activeCharacter?.name ?? "キャラを選択"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {activeSessionId ? "セッション: " + activeSessionId : "—"}
                  </div>
                </div>
              </header>

              {/* Chat */}
              <div className="relative z-10 min-h-0 flex-1 overflow-hidden">
                {activeSessionId ? (
                  <Thread />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    左のサイドバーからキャラを選択してください
                  </div>
                )}
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </TouhouUiProvider>
    </AssistantRuntimeProvider>
  );
}

