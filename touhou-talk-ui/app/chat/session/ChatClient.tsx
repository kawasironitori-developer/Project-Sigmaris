"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { startTransition } from "react";

import ChatPane from "@/components/ChatPaneSession";
import CharacterPanel from "@/components/CharacterPanelSession";

import { CHARACTERS, getCharacterTtsConfig } from "@/data/characters";
import { getGroupsByLocation, canEnableGroup, GroupDef } from "@/data/group";

import { useChatController } from "@/hooks/useChatController";


/* =========================
   Types
========================= */

type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
  speakerId?: string;
  attachments?: {
    name: string;
    size: number;
    type: string;
    previewUrl?: string;
  }[];
  meta?: Record<string, unknown> | null;
};

type SessionSummary = {
  id: string;
  title: string;
  characterId: string;
  mode: "single" | "group";
  layer: string | null;
  location: string | null;
  chatMode?: "partner" | "roleplay" | "coach";
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

  /* =========================
     Channel (talk / vscode)
  ========================= */

  const [channel, setChannel] = useState<"talk" | "vscode">("talk");
  const [vscodeConnected, setVscodeConnected] = useState(true);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(
    null,
  );

  const [messagesBySession, setMessagesBySession] = useState<
    Record<string, Message[]>
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

  const controller = useChatController({
    channel,
    appendMessage,
  });

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
      .filter(Boolean);

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
      setSessionsLoaded(true); // 笘・％繧・
    })();
  }, []);

  /* =========================
     Character select
  ========================= */

  const selectCharacter = useCallback(
    async (characterId: string) => {
      setChannel("talk"); // 笘・繧ｻ繝・す繝ｧ繝ｳ蛻・崛譎ゅ・蠢・★騾壼ｸｸ莨夊ｩｱ縺ｫ謌ｻ縺・

      const existing = sessions.find(
        (s) =>
          s.characterId === characterId &&
          s.layer === currentLayer &&
          s.location === currentLocationId,
      );
      if (existing) {
        setActiveSessionId(existing.id);
        setActiveCharacterId(characterId); // 笘・％繧後′蠢・・
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
        }),
      });

      if (!res.ok) return;
      const data = (await res.json()) as CreateSessionResponse;

      const newSession: SessionSummary = {
        id: data.sessionId,
        title: "譁ｰ縺励＞莨夊ｩｱ",
        characterId,
        mode,
        layer: currentLayer,
        location: currentLocationId,
        chatMode: "partner",
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

  /* =========================
   Reset auto select flag when URL char changes
========================= */
  useEffect(() => {
    autoSelectDoneRef.current = false;
  }, [searchParams.get("char")]);
  /* =========================
   Auto select character from URL (map 竊・chat)
========================= */
  useEffect(() => {
    if (!sessionsLoaded) return;
    if (autoSelectDoneRef.current) return;

    const charFromUrl = searchParams.get("char");
    if (!charFromUrl) return;
    if (!CHARACTERS[charFromUrl]) return;

    autoSelectDoneRef.current = true;

    // 笘・譌｢蟄・/ 譁ｰ隕上・蛻､螳壹・ selectCharacter 縺ｫ螳悟・蟋碑ｭｲ
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
      setChannel("talk"); // 笘・蠢ｵ縺ｮ縺溘ａ繝ｪ繧ｻ繝・ヨ
      setHasSelectedOnce(true);
      setIsPanelOpen(false);
    },
    [sessions],
  );

  const activeChatMode = useMemo(() => {
    const s = sessions.find((x) => x.id === activeSessionId);
    const m = s?.chatMode;
    return m === "roleplay" || m === "coach" ? m : "partner";
  }, [sessions, activeSessionId]);

  const handleSetChatMode = useCallback(
    async (chatMode: "partner" | "roleplay" | "coach") => {
      if (!activeSessionId) return;

      const res = await fetch(`/api/session/${activeSessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatMode }),
      });
      if (!res.ok) return;

      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? { ...s, chatMode } : s)),
      );
    },
    [activeSessionId],
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
        [activeSessionId]: data.messages ?? [],
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
      attachments?: {
        name: string;
        size: number;
        type: string;
        previewUrl?: string;
      }[];
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

      const gen = ++ttsGenerationRef.current;
      ttsQueueRef.current = [];
      ttsBufferRef.current = "";
      ttsConfigByGenRef.current.set(gen, getCharacterTtsConfig(activeCharacterId));
      try {
        ttsCurrentAudioRef.current?.pause();
      } catch {
        // ignore
      }

      // 竭 user message
      appendMessage({
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        attachments: attachments ?? [],
        meta: null,
      });

      // 竭｡ talk蟆ら畑 endpoint
      const endpoint = `/api/session/${activeSessionId}/message`;

      // 竭｢ talk縺ｯ FormData 縺ｧ files 騾√ｋ
      const form = new FormData();
      form.append("characterId", activeCharacterId);
      form.append("text", text);

      for (const file of files) {
        form.append("files", file);
      }

      // 遶ｭ・｣ AI placeholder (stream target)
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

      // 竭｣ ai message
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
                : m
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
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
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
                meta
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

  return (
    <div className="relative flex h-dvh w-full overflow-hidden">
      {/* ===== Mobile / Tablet 蛻晏屓・壹そ繝・す繝ｧ繝ｳ譛ｪ驕ｸ謚槭↑繧牙・逕ｻ髱｢ Panel ===== */}
      {isMobile && !hasSelectedOnce && !activeSessionId && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <CharacterPanel
            characters={CHARACTERS}
            activeCharacterId={activeCharacterId}
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectCharacter={selectCharacter}
            onSelectSession={selectSession}
            onCreateSession={() => {}}
            onRenameSession={handleRenameSession}
            onDeleteSession={handleDeleteSession}
            activeChatMode={activeChatMode}
            onChangeChatMode={handleSetChatMode}
            currentLocationId={currentLocationId}
            currentLayer={currentLayer}
            groupContext={panelGroupContext}
            mode={mode}
            fullScreen
          />
        </div>
      )}

      {/* ===== Desktop ===== */}
      <div className="hidden lg:block">
        <CharacterPanel
          characters={CHARACTERS}
          activeCharacterId={activeCharacterId}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectCharacter={selectCharacter}
          onSelectSession={selectSession}
          onCreateSession={() => {}}
          onRenameSession={handleRenameSession}
          onDeleteSession={handleDeleteSession}
          activeChatMode={activeChatMode}
          onChangeChatMode={handleSetChatMode}
          currentLocationId={currentLocationId}
          currentLayer={currentLayer}
          groupContext={panelGroupContext}
          mode={mode}
        />
      </div>

      {/* ===== Mobile / Tablet 騾壼ｸｸ Panel ===== */}
      {isPanelOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setIsPanelOpen(false)}
          />
          <div className="fixed left-0 top-0 z-50 h-full w-80 lg:hidden">
            <CharacterPanel
              characters={CHARACTERS}
              activeCharacterId={activeCharacterId}
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelectCharacter={selectCharacter}
              onSelectSession={selectSession}
              onCreateSession={() => {}}
              onRenameSession={handleRenameSession}
              onDeleteSession={handleDeleteSession}
              activeChatMode={activeChatMode}
              onChangeChatMode={handleSetChatMode}
              currentLocationId={currentLocationId}
              currentLayer={currentLayer}
              groupContext={panelGroupContext}
              mode={mode}
            />
          </div>
        </>
      )}

      {/* ===== Chat ===== */}
      {activeCharacter && activeSessionId && (
        <ChatPane
          character={activeCharacter}
          messages={activeMessages}
          onSend={channel === "vscode" ? controller.send : handleSendTalk}
          onOpenPanel={() => setIsPanelOpen(true)}
          mode={mode}
          groupContext={mode === "group" ? chatGroupContext : null}
        />
      )}
    </div>
  );
}

