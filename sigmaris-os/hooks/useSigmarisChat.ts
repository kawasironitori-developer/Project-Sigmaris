// /hooks/useSigmarisChat.ts
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";

import { applyEunoiaTone } from "@/lib/eunoia";
import { summarize } from "@/lib/summary";
import type { SafetyReport } from "@/engine/safety/SafetyLayer";

// 🔗 AEI-Core (Python) ブリッジ
import {
  emotion,
  reward,
  value,
  meta,
  longterm,
  getIdentity,
  memory,
} from "@/lib/sigmaris-api";

/* =====================================================
 * Types
 * ====================================================*/
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

// TraitVisualizer 用
export interface TraitGraphPoint {
  time: number; // UNIX ms
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

/* =====================================================
 * fetch wrapper（cookie転送＋キャッシュ完全無効）
 * ====================================================*/
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
    /* bodyなしでもOK */
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

/* =====================================================
 * utils
 * ====================================================*/
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

/* =====================================================
 * useSigmarisChat — 本体
 * ====================================================*/
export function useSigmarisChat() {
  /* -----------------------------
   * State 初期化
   * ----------------------------*/
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);

  const [traits, setTraits] = useState<Trait>({
    calm: 0.5,
    empathy: 0.5,
    curiosity: 0.5,
  });

  // AEI/Persona統合ログ
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

  /* =====================================================
   * セッション一覧ロード
   * ====================================================*/
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
          if (persisted && stillExists) {
            setCurrentChatId(persisted);
          } else if (supabaseChats.length > 0) {
            setCurrentChatId(supabaseChats[0].id);
          }
        }
      }
    } catch (err) {
      console.error("Session load failed:", err);
    }
  }, [currentChatId]);

  /* =====================================================
   * チャットメッセージ取得
   * ====================================================*/
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

  /* 初回ロード */
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  /* セッション切替監視 */
  useEffect(() => {
    if (!currentChatId) return;
    loadMessages(currentChatId);

    if (typeof window !== "undefined") {
      localStorage.setItem("sigmaris_current_session", currentChatId);
    }
  }, [currentChatId, loadMessages]);

  /* =====================================================
   * Persona 初期状態をロード
   * ====================================================*/
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchJSON<any>("/api/persona");
        if (!data || data.error) return;

        const baseTraits: Trait = {
          calm: data.calm ?? 0.5,
          empathy: data.empathy ?? 0.5,
          curiosity: data.curiosity ?? 0.5,
        };

        setTraits(baseTraits);
        setReflectionText(data.reflection || "");
        setMetaSummary(data.meta_summary || "");

        // growthLog 初期化
        setGrowthLog([
          {
            ...baseTraits,
            source: "persona-init",
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

  /* =====================================================
   * TraitVisualizer 用：growthLog → graphData
   * ====================================================*/
  const graphData: TraitGraphPoint[] = useMemo(() => {
    if (!growthLog || growthLog.length === 0) return [];

    return growthLog
      .map((entry) => {
        const tsRaw = entry.timestamp;
        const ts =
          typeof tsRaw === "string" ? Date.parse(tsRaw) : Number(tsRaw);
        const safeTime = Number.isFinite(ts) ? ts : Date.now();

        const calm = typeof entry.calm === "number" ? entry.calm : traits.calm;
        const empathy =
          typeof entry.empathy === "number" ? entry.empathy : traits.empathy;
        const curiosity =
          typeof entry.curiosity === "number"
            ? entry.curiosity
            : traits.curiosity;

        const identitySnapshot = entry.identity_snapshot ?? null;
        const baseline =
          identitySnapshot && identitySnapshot.baseline
            ? {
                calm: identitySnapshot.baseline.calm,
                empathy: identitySnapshot.baseline.empathy,
                curiosity: identitySnapshot.baseline.curiosity,
              }
            : undefined;

        return {
          time: safeTime,
          calm,
          empathy,
          curiosity,
          baseline,
          source: entry.source,
        } as TraitGraphPoint;
      })
      .sort((a, b) => a.time - b.time);
  }, [growthLog, traits]);

  /* =====================================================
   * handleSend（StateMachine → AEI-Core Identity 統合）
   * ====================================================*/
  const handleSend = async () => {
    if (!input.trim() || !currentChatId) return;

    const userMessage = input.trim();
    const tempMessages = [...messages, { user: userMessage, ai: "..." }];
    setMessages(tempMessages);
    setInput("");
    setLoading(true);

    try {
      /* ----------------------------------
       * 1) 会話の要約
       * ----------------------------------*/
      let recentMessages = messages;
      let summary = "";

      if (messages.length > 30) {
        recentMessages = messages.slice(-10);
        summary = await summarize(messages.slice(0, -10));
      }

      /* ----------------------------------
       * 2) Next.js StateMachine を実行
       * ----------------------------------*/
      const data = await fetchJSON<{
        output: string;
        traits?: Trait;
        safety?: SafetyReport;
        model?: string;
        python?: any;
      }>("/api/aei", {
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

      const rawText: string = data.output || "（応答なし）";

      const stateMachineTraits: Trait = {
        calm: data.traits?.calm ?? traits.calm,
        empathy: data.traits?.empathy ?? traits.empathy,
        curiosity: data.traits?.curiosity ?? traits.curiosity,
      };

      if (data.safety) {
        setSafetyReport(data.safety);
      }

      /* ----------------------------------
       * 3) AEI-Core の6モジュールを並列実行
       * ----------------------------------*/
      const [
        emotionRes,
        rewardRes,
        valueRes,
        metaRes,
        longtermRes,
        identityRes,
      ] = await Promise.all([
        emotion(userMessage).catch(() => null),
        reward().catch(() => null),
        value().catch(() => null),
        meta().catch(() => null),
        longterm().catch(() => null),
        getIdentity().catch(() => null),
      ]);

      const emotionState = emotionRes?.emotion ?? null;
      const rewardState = rewardRes?.reward ?? null;
      const valueState = valueRes?.value ?? null;
      const metaState = metaRes?.meta ?? null;
      const longtermState = longtermRes?.longterm ?? null;

      const identitySnapshot = identityRes ?? null;

      /* ----------------------------------
       * 4) meta → UI反映
       * ----------------------------------*/
      if (metaState?.meta_summary) {
        setMetaSummary(metaState.meta_summary);
      }
      if (metaState?.reflection) {
        setReflectionText(metaState.reflection);
      }

      /* ----------------------------------
       * 5) Identity Snapshot を最優先に traits を確定
       *    （b方式）
       * ----------------------------------*/
      const finalTraits: Trait = {
        calm:
          typeof identitySnapshot?.calm === "number"
            ? identitySnapshot.calm
            : stateMachineTraits.calm,

        empathy:
          typeof identitySnapshot?.empathy === "number"
            ? identitySnapshot.empathy
            : stateMachineTraits.empathy,

        curiosity:
          typeof identitySnapshot?.curiosity === "number"
            ? identitySnapshot.curiosity
            : stateMachineTraits.curiosity,
      };

      setTraits(finalTraits);

      /* ----------------------------------
       * 6) GPT 出力に人格トーンを適用
       * ----------------------------------*/
      const aiText = applyEunoiaTone(rawText, {
        tone:
          finalTraits.empathy > 0.7
            ? "friendly"
            : finalTraits.calm > 0.7
            ? "gentle"
            : "neutral",
        empathyLevel: finalTraits.empathy,
      });

      /* ----------------------------------
       * 7) Episodic Memory snapshot
       * ----------------------------------*/
      try {
        await memory();
      } catch {}

      /* ----------------------------------
       * 8) 英訳
       * ----------------------------------*/
      const [userEn, aiEn] = await Promise.all([
        translateToEnglish(userMessage),
        translateToEnglish(aiText),
      ]);

      /* ----------------------------------
       * 9) growthLog 更新
       * ----------------------------------*/
      setGrowthLog((prev) => [
        ...prev,
        {
          ...finalTraits,
          source: "aei-core",
          emotion_state: emotionState,
          reward_state: rewardState,
          value_state: valueState,
          meta_state: metaState,
          longterm_state: longtermState,
          identity_snapshot: identitySnapshot,
          timestamp:
            (identitySnapshot && identitySnapshot.timestamp) ||
            new Date().toISOString(),
        },
      ]);

      /* ----------------------------------
       * 10) メッセージ追加（30件クリップ）
       * ----------------------------------*/
      const updatedMessages = [
        ...tempMessages.slice(-30, -1),
        { user: userMessage, ai: aiText, user_en: userEn, ai_en: aiEn },
      ];

      setMessages(updatedMessages);

      /* ----------------------------------
       * 11) セッション更新
       * ----------------------------------*/
      await loadSessions();

      setModelUsed(data.model || "AEI-Core");
    } catch (err) {
      console.error("AEI send failed:", err);
    } finally {
      setLoading(false);
    }
  };
  /* =====================================================
   * Reflect（従来の ReflectionEngine との互換維持）
   * ====================================================*/
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

      /* --- EN 変換 --- */
      const [reflectionEn, metaEn] = await Promise.all([
        translateToEnglish(reflectionJa),
        translateToEnglish(metaJa),
      ]);

      setReflectionTextEn(reflectionEn);
      setMetaSummaryEn(metaEn);

      setReflectionText(lang === "en" ? reflectionEn : reflectionJa);
      setMetaSummary(lang === "en" ? metaEn : metaJa);

      /* --- safety レポート更新 --- */
      setSafetyReport(data.safety || undefined);

      /* --- trait 更新 --- */
      if (data.traits) {
        setTraits({
          calm: data.traits.calm ?? traits.calm,
          empathy: data.traits.empathy ?? traits.empathy,
          curiosity: data.traits.curiosity ?? traits.curiosity,
        });
      }

      /* --- growthLog に記録を追加 --- */
      setGrowthLog((prev) => [
        ...prev,
        {
          calm: data.traits?.calm ?? traits.calm,
          empathy: data.traits?.empathy ?? traits.empathy,
          curiosity: data.traits?.curiosity ?? traits.curiosity,
          source: "reflect-core",
          reflection: reflectionJa,
          metaSummary: metaJa,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error("Reflect failed:", err);
    } finally {
      setReflecting(false);
    }
  };

  /* =====================================================
   * 言語切替
   * ====================================================*/
  useEffect(() => {
    if (lang === "en") {
      if (reflectionTextEn) setReflectionText(reflectionTextEn);
      if (metaSummaryEn) setMetaSummary(metaSummaryEn);
    }
  }, [lang, reflectionTextEn, metaSummaryEn]);

  /* =====================================================
   * セッション管理
   * ====================================================*/
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
    } catch (err) {
      console.error("Delete chat failed:", err);
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
    } catch (err) {
      console.error("Rename chat failed:", err);
    }
  };

  /* =====================================================
   * メッセージ削除
   * ====================================================*/
  const handleDeleteMessage = async (index: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== index));

    if (!currentChatId) return;

    try {
      await fetchJSON(
        `/api/messages?session=${encodeURIComponent(currentChatId)}`,
        { method: "DELETE" }
      );
    } catch (err) {
      console.error("Delete messages failed:", err);
    }
  };

  /* =====================================================
   * Hook の return
   * ====================================================*/
  return {
    input,
    setInput,
    chats,
    currentChatId,
    messages,

    traits,
    reflectionText,
    metaSummary,
    reflectionTextEn,
    metaSummaryEn,

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

    growthLog,
    graphData, // ← TraitVisualizer 用
  };
}