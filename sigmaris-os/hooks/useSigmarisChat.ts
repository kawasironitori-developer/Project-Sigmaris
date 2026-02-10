// /hooks/useSigmarisChat.ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import { applyEunoiaTone } from "@/lib/eunoia";
import { summarize } from "@/lib/summary";
import type { SafetyReport } from "@/types/safety";

interface Message {
  user: string;
  ai: string;
  user_en?: string;
  ai_en?: string;
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
  lastMessage?: string;
  updatedAt?: string;
  messageCount?: number;
}

export interface TraitGraphPoint {
  time: number;
  calm: number;
  empathy: number;
  curiosity: number;
  baseline?: {
    calm?: number;
    empathy?: number;
    curiosity?: number;
  };
  source?: string;
}

const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  return fetch(url, {
    ...options,
    credentials: "include",
    next: { revalidate: 0 },
    headers: {
      "Cache-Control": "no-store",
      ...(options.headers || {}),
    },
  });
};

const fetchJSON = async <T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> => {
  const res = await fetchWithAuth(url, options);
  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const msg =
      payload?.error ||
      payload?.message ||
      `HTTP ${res.status} on ${url} (${res.statusText})`;
    throw new Error(msg);
  }
  return payload as T;
};

async function translateToEnglish(text: string): Promise<string> {
  if (!text?.trim()) return "";
  try {
    const data = await fetchJSON<{ translation?: string }>("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, targetLang: "en" }),
    });
    return data.translation || text;
  } catch (err) {
    console.error("Translation failed:", err);
    return text;
  }
}

function parseSseBlock(block: string): { event: string; dataRaw: string } {
  const lines = block.split("\n");
  let event = "message";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  return { event, dataRaw: dataLines.join("\n") };
}

export function useSigmarisChat() {
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

  const [reflectionTextEn, setReflectionTextEn] = useState("");
  const [metaSummaryEn, setMetaSummaryEn] = useState("");

  const [loading, setLoading] = useState(false);
  const [reflecting, setReflecting] = useState(false);

  const [modelUsed, setModelUsed] = useState("sigmaris-core");
  const [safetyReport, setSafetyReport] = useState<SafetyReport | undefined>();

  const [chats, setChats] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const data = await fetchJSON<{ sessions: any[] }>("/api/sessions");
      const supabaseChats: ChatSession[] = (data.sessions ?? []).map(
        (s: any) => ({
          id: s.id,
          title: s.title,
          messages: [],
          lastMessage: s.lastMessage,
          updatedAt: s.updatedAt,
          messageCount: s.messageCount,
        })
      );
      setChats(supabaseChats);

      if (typeof window !== "undefined") {
        const persisted = localStorage.getItem("sigmaris_current_session");
        const stillExists = supabaseChats.find((c) => c.id === persisted);
        if (!currentChatId) {
          if (persisted && stillExists) setCurrentChatId(persisted);
          else if (supabaseChats.length > 0) setCurrentChatId(supabaseChats[0].id);
        }
      }
    } catch (err) {
      console.error("Session load failed:", err);
    }
  }, [currentChatId]);

  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const data = await fetchJSON<{ messages: Message[] }>(
        `/api/aei?session=${encodeURIComponent(sessionId)}`
      );
      setMessages(data.messages ?? []);
    } catch (err) {
      console.error("Message load failed:", err);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!currentChatId) return;
    loadMessages(currentChatId);
    if (typeof window !== "undefined") {
      localStorage.setItem("sigmaris_current_session", currentChatId);
    }
  }, [currentChatId, loadMessages]);

  const graphData: TraitGraphPoint[] = useMemo(() => {
    if (!growthLog || growthLog.length === 0) return [];
    return growthLog
      .map((entry: any) => {
        const safeTime = entry?.timestamp
          ? new Date(entry.timestamp).getTime()
          : Date.now();
        return {
          time: safeTime,
          calm: Number(entry.calm ?? 0.5),
          empathy: Number(entry.empathy ?? 0.5),
          curiosity: Number(entry.curiosity ?? 0.5),
          source: entry.source,
        } as TraitGraphPoint;
      })
      .sort((a, b) => a.time - b.time);
  }, [growthLog]);

  const handleNewChat = useCallback(async () => {
    const newId = uuidv4();
    setCurrentChatId(newId);
    setMessages([]);
    setGrowthLog([]);
    setReflectionText("");
    setMetaSummary("");
    setReflectionTextEn("");
    setMetaSummaryEn("");
  }, []);

  const handleSelectChat = useCallback((id: string) => {
    setCurrentChatId(id);
  }, []);

  const handleDeleteChat = useCallback(
    async (id: string) => {
      try {
        await fetchJSON(`/api/sessions?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (currentChatId === id) setCurrentChatId(null);
        await loadSessions();
      } catch (err) {
        console.error("Session delete failed:", err);
      }
    },
    [currentChatId, loadSessions]
  );

  const handleRenameChat = useCallback(
    async (id: string, newTitle: string) => {
      try {
        await fetchJSON("/api/sessions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: id, newTitle }),
        });
        await loadSessions();
      } catch (err) {
        console.error("Session rename failed:", err);
      }
    },
    [loadSessions]
  );

  const handleSend = useCallback(async () => {
    if (loading) return;
    if (!input.trim() || !currentChatId) return;

    const userMessage = input.trim();
    setInput("");
    setLoading(true);
    setMessages((prev) => [...prev, { user: userMessage, ai: "..." }]);

    let replyAcc = "";
    let finalMeta: any = null;

    try {
      const res = await fetchWithAuth("/api/aei/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": currentChatId,
        },
        body: JSON.stringify({ text: userMessage }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          detail || `Stream failed: HTTP ${res.status} (${res.statusText})`
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let doneReceived = false;

      const pushDelta = (text: string) => {
        if (!text) return;
        replyAcc += text;
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const last = next[next.length - 1];
          const prevAi = typeof last.ai === "string" ? last.ai : "";
          const nextAi = prevAi === "..." ? text : prevAi + text;
          next[next.length - 1] = { ...last, ai: nextAi };
          return next;
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

          const { event, dataRaw } = parseSseBlock(block);
          if (event === "delta") {
            try {
              const parsed = JSON.parse(dataRaw);
              pushDelta(typeof parsed?.text === "string" ? parsed.text : "");
            } catch {
              pushDelta(dataRaw);
            }
          } else if (event === "done") {
            try {
              const parsed = JSON.parse(dataRaw);
              finalMeta = parsed?.meta ?? null;
              replyAcc =
                typeof parsed?.reply === "string" ? parsed.reply : replyAcc;
            } catch {
              // ignore
            }
            doneReceived = true;
            break;
          } else if (event === "error") {
            console.warn("Stream error:", dataRaw);
          }
        }
      }

      const rawText =
        typeof replyAcc === "string" && replyAcc.trim().length > 0
          ? replyAcc
          : "（応答生成が一時的に利用できません。）";

      const traitState = finalMeta?.trait?.state;
      const nextTraits: Trait = {
        calm: typeof traitState?.calm === "number" ? traitState.calm : traits.calm,
        empathy:
          typeof traitState?.empathy === "number"
            ? traitState.empathy
            : traits.empathy,
        curiosity:
          typeof traitState?.curiosity === "number"
            ? traitState.curiosity
            : traits.curiosity,
      };
      setTraits(nextTraits);

      if (finalMeta?.safety) setSafetyReport(finalMeta.safety as SafetyReport);

      const aiText = applyEunoiaTone(rawText, {
        tone:
          nextTraits.empathy > 0.7
            ? "friendly"
            : nextTraits.calm > 0.7
              ? "gentle"
              : "neutral",
        empathyLevel: nextTraits.empathy,
      });

      const [userEn, aiEn] = await Promise.all([
        translateToEnglish(userMessage),
        translateToEnglish(aiText),
      ]);

      setGrowthLog((prev) => [
        ...prev,
        {
          ...nextTraits,
          source: "sigmaris-core",
          server_meta: finalMeta ?? null,
          timestamp: new Date().toISOString(),
        },
      ]);

      setMessages((prev) => {
        const next = [...prev];
        if (next.length > 0) {
          next[next.length - 1] = {
            user: userMessage,
            ai: aiText,
            user_en: userEn,
            ai_en: aiEn,
          };
        }
        return next.slice(-30);
      });

      setModelUsed(
        (typeof finalMeta?.io?.model === "string" && finalMeta.io.model) ||
          "sigmaris-core"
      );

      if (finalMeta) {
        const topic =
          finalMeta?.identity?.topic_label ??
          finalMeta?.controller_meta?.global_state?.meta?.identity_topic_label;
        const state =
          finalMeta?.global_state?.state ??
          finalMeta?.controller_meta?.global_state?.state;
        const mem =
          finalMeta?.memory?.initial_pointer_count ??
          finalMeta?.controller_meta?.memory?.pointer_count;

        setMetaSummary(
          [
            topic ? `topic: ${topic}` : null,
            state ? `state: ${state}` : null,
            typeof mem === "number" ? `memory: ${mem}` : null,
          ]
            .filter(Boolean)
            .join("\n")
        );
      }

      await loadSessions();
    } catch (err) {
      console.error("Send failed:", err);
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.ai === "...") {
          next[next.length - 1] = {
            ...last,
            ai: "（ストリーミングに失敗しました。しばらくしてから再試行してください。）",
          };
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [currentChatId, input, loadSessions, loading, traits.calm, traits.curiosity, traits.empathy]);

  const handleReflect = useCallback(async () => {
    if (!currentChatId) return;
    setReflecting(true);
    try {
      const sum = await summarize(messages);
      setReflectionText(sum);
      setMetaSummary(sum ? "summary generated" : "");
      setReflectionTextEn("");
      setMetaSummaryEn("");
    } catch (err) {
      console.error("Reflect failed:", err);
    } finally {
      setReflecting(false);
    }
  }, [currentChatId, messages]);

  return {
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
    graphData,
    safetyReport,
    handleSend,
    handleReflect,
    handleNewChat,
    handleSelectChat,
    handleDeleteChat,
    handleRenameChat,
  };
}

