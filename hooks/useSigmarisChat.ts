"use client";
import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { applyEunoiaTone } from "@/lib/eunoia";
import type { SafetyReport } from "@/engine/safety/SafetyLayer";

// ===== 型定義 =====
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

// ===== 翻訳関数 =====
async function translateToEnglish(text: string): Promise<string> {
  if (!text?.trim()) return "";
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, targetLang: "en" }),
    });
    const data = await res.json();
    return data.translation || text;
  } catch (err) {
    console.error("Translation failed:", err);
    return text;
  }
}

export function useSigmarisChat() {
  // ====== 状態 ======
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
  const [loading, setLoading] = useState(false);
  const [reflecting, setReflecting] = useState(false);
  const [modelUsed, setModelUsed] = useState("AEI-Core");
  const [safetyReport, setSafetyReport] = useState<SafetyReport | undefined>();
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [lang, setLang] = useState<"ja" | "en">("ja"); // 言語モード

  // ====== セッション一覧 ======
  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) return;
      const data = await res.json();
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

  // ====== メッセージ取得 ======
  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/aei?session=${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch (err) {
      console.error("AEI message load failed:", err);
    }
  }, []);

  // ====== 初期ロード ======
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

  // ====== ペルソナロード ======
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/persona");
        if (!res.ok) return;
        const data = await res.json();
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
      } catch (err) {
        console.error("Persona load failed:", err);
      }
    })();
  }, []);

  // ====== メッセージ送信（日英翻訳対応） ======
  const handleSend = async () => {
    if (!input.trim() || !currentChatId) return;
    const userMessage = input.trim();
    const tempMessages = [...messages, { user: userMessage, ai: "..." }];
    setMessages(tempMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/aei", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": currentChatId,
        },
        body: JSON.stringify({ text: userMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "AEI API error");

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
        ...tempMessages.slice(0, -1),
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

  // ====== Reflect（翻訳キャッシュ対応版） ======
  const handleReflect = async () => {
    if (!currentChatId) return;
    setReflecting(true);
    try {
      const res = await fetch("/api/reflect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": currentChatId,
        },
        body: JSON.stringify({ messages, growthLog }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Reflect API error");

      // 日本語ベースの内省とメタ内省を取得
      const reflectionJa = data.reflection || "";
      const metaJa = data.metaSummary || "";

      // 🌐 英訳を生成（DBには保存しない）
      const [reflectionEn, metaEn] = await Promise.all([
        translateToEnglish(reflectionJa),
        translateToEnglish(metaJa),
      ]);

      // 言語トグルに応じて反映
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

  // ====== 新規チャット ======
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

  // ====== チャット選択 ======
  const handleSelectChat = (id: string) => setCurrentChatId(id);

  // ====== メッセージ削除（スレ単位） ======
  const handleDeleteChat = async (id: string) => {
    try {
      await fetch(`/api/sessions?id=${id}`, { method: "DELETE" });
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

  // ====== チャットリネーム ======
  const handleRenameChat = async (id: string, newTitle: string) => {
    try {
      const res = await fetch("/api/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id, newTitle }),
      });
      if (!res.ok) throw new Error("Rename failed");
      setChats((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
      );
      await loadSessions();
    } catch (e) {
      console.error("Rename chat failed:", e);
    }
  };

  // ====== メッセージ単体削除 ======
  const handleDeleteMessage = async (index: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== index));
    if (!currentChatId) return;
    await fetch(`/api/messages?session=${currentChatId}`, { method: "DELETE" });
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
    setLang, // 言語切替
    handleSend,
    handleReflect,
    handleNewChat,
    handleSelectChat,
    handleDeleteChat,
    handleRenameChat,
    handleDeleteMessage,
  };
}
