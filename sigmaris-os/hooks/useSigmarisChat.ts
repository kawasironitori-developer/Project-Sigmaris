// /hooks/useSigmarisChat.ts
"use client";

import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { applyEunoiaTone } from "@/lib/eunoia";
import { summarize } from "@/lib/summary";
import type { SafetyReport } from "@/engine/safety/SafetyLayer";

/* ================= Types ================= */
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

/* ============= fetch helper (cookie転送＋キャッシュ無効) ============= */
const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  return fetch(url, {
    ...options,
    credentials: "include",
    // Next.js App Routerのデフォルトキャッシュを完全無効化
    // （Vercelでの古いレスポンスやCookie欠落を防ぐ）
    next: { revalidate: 0 },
    headers: {
      "Cache-Control": "no-store",
      ...(options.headers || {}),
    },
  });
};

const fetchJSON = async <T = any>(url: string, options: RequestInit = {}) => {
  const res = await fetchWithAuth(url, options);
  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    // no-op: body がない場合もある
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

/* ================= utils ================= */
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

/* ================= Hook ================= */
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
  const [modelUsed, setModelUsed] = useState("AEI-Core");
  const [safetyReport, setSafetyReport] = useState<SafetyReport | undefined>();
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [lang, setLang] = useState<"ja" | "en">("ja");

  /** 🔹 セッション一覧を取得 */
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
          if (persisted && stillExists) setCurrentChatId(persisted as string);
          else if (supabaseChats.length > 0)
            setCurrentChatId(supabaseChats[0].id);
        }
      }
    } catch (e) {
      console.error("Session load failed:", e);
    }
  }, [currentChatId]);

  /** 🔹 メッセージ一覧を取得 */
  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const data = await fetchJSON<{ messages: Message[] }>(
        `/api/aei?session=${encodeURIComponent(sessionId)}`
      );
      setMessages(data.messages ?? []);
    } catch (err) {
      console.error("AEI message load failed:", err);
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

  /** 🔹 ペルソナ情報をロード */
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchJSON<any>("/api/persona");
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
        setReflectionTextEn("");
        setMetaSummaryEn("");
      } catch (err) {
        console.error("Persona load failed:", err);
      }
    })();
  }, []);

  /** 🔹 メッセージ送信 */
  const handleSend = async () => {
    if (!input.trim() || !currentChatId) return;

    const userMessage = input.trim();
    const tempMessages = [...messages, { user: userMessage, ai: "..." }];
    setMessages(tempMessages);
    setInput("");
    setLoading(true);

    try {
      let recentMessages = messages;
      let summary = "";
      if (messages.length > 30) {
        recentMessages = messages.slice(-10);
        summary = await summarize(messages.slice(0, -10));
      }

      const data = await fetchJSON<any>("/api/aei", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": currentChatId,
        },
        body: JSON.stringify({
          text: userMessage,
          recent: recentMessages,
          summary,
        }),
      });

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

      const [userEn, aiEn] = await Promise.all([
        translateToEnglish(userMessage),
        translateToEnglish(aiText),
      ]);

      const updatedMessages = [
        ...tempMessages.slice(-30, -1),
        { user: userMessage, ai: aiText, user_en: userEn, ai_en: aiEn },
      ];
      setMessages(updatedMessages);
      await loadSessions();

      if (data.traits) setTraits(data.traits);
      if (data.reflection) setReflectionText(data.reflection);
      if (data.metaSummary) setMetaSummary(data.metaSummary);
      setModelUsed("AEI-Core");
    } catch (err) {
      console.error("AEI send failed:", err);
    } finally {
      setLoading(false);
    }
  };

  /** 🔹 Reflect */
  const handleReflect = async () => {
    if (!currentChatId) return;
    setReflecting(true);
    try {
      const data = await fetchJSON<any>("/api/reflect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": currentChatId,
        },
        body: JSON.stringify({ messages, growthLog }),
      });

      const reflectionJa = data.reflection || "";
      const metaJa = data.metaSummary || "";

      const [reflectionEn, metaEn] = await Promise.all([
        translateToEnglish(reflectionJa),
        translateToEnglish(metaJa),
      ]);

      setReflectionTextEn(reflectionEn);
      setMetaSummaryEn(metaEn);
      setReflectionText(lang === "en" ? reflectionEn : reflectionJa);
      setMetaSummary(lang === "en" ? metaEn : metaJa);
      setSafetyReport(data.safety || undefined);
      if (data.traits) setTraits(data.traits);
    } catch (err) {
      console.error("Reflect failed:", err);
    } finally {
      setReflecting(false);
    }
  };

  /* 🔄 言語切替 */
  useEffect(() => {
    if (lang === "en") {
      if (reflectionTextEn) setReflectionText(reflectionTextEn);
      if (metaSummaryEn) setMetaSummary(metaSummaryEn);
    }
  }, [lang, reflectionTextEn, metaSummaryEn]);

  /* 🔧 セッション操作 */
  const handleNewChat = () => {
    const newId = uuidv4();
    const newChat: ChatSession = {
      id: newId,
      title: `Chat ${chats.length + 1}`,
      messages: [],
    };
    setChats((prev) => [newChat, ...prev]);
    setCurrentChatId(newId);
    setMessages([]);
  };

  const handleSelectChat = (id: string) => setCurrentChatId(id);

  const handleDeleteChat = async (id: string) => {
    try {
      await fetchJSON(`/api/sessions?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (currentChatId === id) {
        setCurrentChatId(null);
        setMessages([]);
      }
      await loadSessions();
    } catch (e) {
      console.error("Delete chat failed:", e);
    }
  };

  const handleRenameChat = async (id: string, newTitle: string) => {
    try {
      await fetchJSON("/api/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id, newTitle }),
      });
      setChats((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
      );
      await loadSessions();
    } catch (e) {
      console.error("Rename chat failed:", e);
    }
  };

  const handleDeleteMessage = async (index: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== index));
    if (!currentChatId) return;
    try {
      await fetchJSON(
        `/api/messages?session=${encodeURIComponent(currentChatId)}`,
        {
          method: "DELETE",
        }
      );
    } catch (e) {
      console.error("Delete messages failed:", e);
    }
  };

  return {
    input,
    setInput,
    chats,
    currentChatId,
    messages,
    traits,
    reflectionText,
    metaSummary,
    loading,
    reflecting,
    safetyReport,
    modelUsed,
    lang,
    setLang,
    handleSend,
    handleReflect,
    handleNewChat,
    handleSelectChat,
    handleDeleteChat,
    handleRenameChat,
    handleDeleteMessage,
    reflectionTextEn,
    metaSummaryEn,
  };
}
