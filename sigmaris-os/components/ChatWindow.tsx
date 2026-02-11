// ============================================================
// ChatWindow  — Sigmaris Full PersonaOS + AEI 完全版
// （UI は応答を生成しない。route.ts が最終応答を生成する仕様）
// ============================================================
"use client";

import { useRef, useState } from "react";
import { requestPersonaV2Decision } from "@/lib/sigmaris-api";

// -----------------------------
// 型定義
// -----------------------------
type ChatMessage = {
  role: "user" | "ai";
  content: string;
};

type GlobalStatePayload = {
  state: string;
  prev_state?: string | null;
  reasons?: string[];
  meta?: any;
};

type PersonaMetaPayload = any;

// ============================================================
// ChatWindow — 「応答は route.ts だけが生成」
// ============================================================
export default function ChatWindow({
  sessionId,
  initialMessages = [],
}: {
  sessionId: string;
  initialMessages: { role: string; content: string }[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages.map((m) => ({
      role: m.role === "user" ? "user" : "ai",
      content: m.content,
    }))
  );

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Persona v2 の状態可視化用
  const [globalState, setGlobalState] = useState<GlobalStatePayload | null>(
    null
  );
  const [meta, setMeta] = useState<PersonaMetaPayload | null>(null);

  // ============================================================
  // 送信（※ route.ts が最終応答を生成する）
  // ============================================================
  const handleSend = async () => {
    if (!input.trim()) return;

    const userText = input.trim();
    const files = attachedFiles.slice(0, 3);

    // --- UI にユーザーメッセージを追加 ---
    const displayText =
      files.length > 0
        ? `${userText}\n\n[添付] ${files.map((f) => f.name).join(", ")}`
        : userText;
    setMessages((prev) => [...prev, { role: "user", content: displayText }]);
    setInput("");
    setAttachedFiles([]);
    setLoading(true);

    try {
      // =====================================================
      // 1) Persona Core v2 decision は「状態取得のみ」
      // =====================================================
      let personaDecision = null;

      try {
        personaDecision = await requestPersonaV2Decision({
          user_id: "u-local",
          request: { message: userText },
          value_state: {
            stability: 0,
            openness: 0,
            safety_bias: 0,
            user_alignment: 0,
          },
          trait_state: {
            calm: 0.5,
            empathy: 0.5,
            curiosity: 0.5,
          },
        } as any);

        setGlobalState(personaDecision?.global_state ?? null);
        setMeta(personaDecision?.meta ?? null);
      } catch (err) {
        console.error("Persona v2 decision failed:", err);
      }

      // =====================================================
      // 2) route.ts に完全委譲して「最終応答（GPT生成）」を取得
      // =====================================================
      const form = new FormData();
      form.append("text", userText);
      for (const f of files) form.append("files", f);

      const res = await fetch("/api/aei", {
        method: "POST",
        headers: {
          "x-session-id": sessionId,
        },
        body: form,
      });

      const data = await res.json();

      const aiOutput =
        data?.output ||
        "（応答生成に失敗しましたが、対話ループは維持されています）";

      setMessages((prev) => [...prev, { role: "ai", content: aiOutput }]);
    } catch (err) {
      console.error("ChatWindow send error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: "⚠️ エラーが発生しました。（ログを確認してください）",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 状態パネル（Persona v2 可視化）
  // ============================================================
  const renderGlobalStatePanel = () => {
    if (!globalState) {
      return (
        <div className="text-sm text-gray-400">
          まだ Persona Core v2 の状態がありません。
        </div>
      );
    }

    // 🔧 修正ポイント（唯一の追加）
    // undefined の可能性を完全に除去
    const reasons: string[] = Array.isArray(globalState.reasons)
      ? globalState.reasons
      : [];

    return (
      <div className="space-y-2 text-sm">
        <div className="text-xs text-gray-400">STATE</div>
        <div className="text-lg font-semibold">{globalState.state}</div>

        {globalState.prev_state && (
          <div className="text-xs text-gray-400">
            prev: {globalState.prev_state}
          </div>
        )}

        {reasons.length > 0 && (
          <ul className="list-disc text-xs space-y-1 pl-4">
            {reasons.map((r: string, i: number) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  const renderMemoryPanel = () => {
    const ic = globalState?.meta?.identity_context;
    const mem = meta?.memory;

    if (!ic && !mem) {
      return (
        <div className="text-sm text-gray-400">
          記憶統合データはまだありません。
        </div>
      );
    }

    return (
      <div className="space-y-3 text-sm">
        {mem && (
          <div>
            <div className="text-gray-400 text-xs mb-1">Memory Pointers</div>
            <div className="text-xs">
              count: {mem.pointer_count} / merged:{" "}
              {mem.has_merged_summary ? "yes" : "no"}
            </div>
          </div>
        )}

        {ic?.topic_label && (
          <div>
            <div className="text-gray-400 text-xs">Topic</div>
            <div className="text-xs">{ic.topic_label}</div>
          </div>
        )}

        {ic?.memory_preview && (
          <div>
            <div className="text-gray-400 text-xs mb-1">
              Memory Preview (Identity)
            </div>
            <pre className="text-xs bg-gray-900 border border-gray-800 p-2 rounded whitespace-pre-wrap max-h-40 overflow-y-auto">
              {ic.memory_preview}
            </pre>
          </div>
        )}
      </div>
    );
  };

  // ============================================================
  // UI
  // ============================================================
  return (
    <div className="flex flex-col md:flex-row h-screen bg-black text-gray-100">
      {/* ---------------------------------- */}
      {/*          チャット本体              */}
      {/* ---------------------------------- */}
      <div className="flex-1 flex flex-col border-r border-gray-800">
        <div className="flex-1 overflow-y-auto space-y-3 p-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`p-3 rounded-lg max-w-[80%] text-sm ${
                m.role === "user"
                  ? "bg-blue-600 text-white ml-auto"
                  : "bg-gray-800"
              }`}
            >
              {m.content}
            </div>
          ))}

          {loading && (
            <div className="text-gray-400 text-sm animate-pulse">
              Sigmaris is thinking…
            </div>
          )}
        </div>

        <div className="p-3 border-t border-gray-800 flex items-center gap-2 bg-gray-900">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []).slice(0, 3);
              setAttachedFiles(list);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="px-3 py-2 bg-gray-800 rounded text-sm disabled:opacity-50"
            title="Attach files (max 3)"
          >
            Attach
          </button>
          <input
            className="flex-1 bg-gray-800 px-3 py-2 text-sm rounded"
            placeholder="type your message…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && handleSend()}
          />
          {attachedFiles.length > 0 && (
            <div
              className="text-xs text-gray-300 max-w-[220px] truncate"
              title={attachedFiles.map((f) => f.name).join(", ")}
            >
              {attachedFiles.length} file(s)
            </div>
          )}
          <button
            onClick={handleSend}
            disabled={loading}
            className="ml-2 px-4 py-2 bg-blue-600 rounded text-sm disabled:opacity-50"
          >
            送信
          </button>
        </div>
      </div>

      {/* ---------------------------------- */}
      {/*        Persona 状態パネル           */}
      {/* ---------------------------------- */}
      <div className="w-full md:w-96 bg-gray-950 p-4 space-y-6 overflow-y-auto">
        <div>
          <h2 className="text-xs text-gray-400 mb-2">PERSONA STATE</h2>
          {renderGlobalStatePanel()}
        </div>

        <div>
          <h2 className="text-xs text-gray-400 mb-2">MEMORY / IDENTITY</h2>
          {renderMemoryPanel()}
        </div>
      </div>
    </div>
  );
}
