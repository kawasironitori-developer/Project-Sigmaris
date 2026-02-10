"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { GroupDef } from "@/data/group";

/* =========================
   Types
========================= */

type Character = {
  id: string;
  name: string;
  title: string;
  world?: {
    map: string;
    location: string;
  };
  color?: {
    accent?: string;
    text?: string;
  };
};

type SessionSummary = {
  id: string;
  title: string;
};

type GroupContext = {
  enabled: boolean;
  label: string;
  group: GroupDef;
};

type Props = {
  characters: Record<string, Character>;

  activeCharacterId: string | null;
  onSelectCharacter: (id: string) => void;

  sessions: SessionSummary[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onRenameSession: (id: string, title: string) => void;
  onDeleteSession: (id: string) => void;

  activeChatMode?: "partner" | "roleplay" | "coach";
  onChangeChatMode?: (mode: "partner" | "roleplay" | "coach") => void;

  currentLocationId?: string | null;
  currentLayer?: string | null;
  fullScreen?: boolean;

  groupContext?: GroupContext | null;
  onStartGroup?: () => void;

  mode?: "single" | "group";
};

/* =========================
   Component
========================= */

export default function CharacterPanel({
  characters,
  activeCharacterId,
  onSelectCharacter,

  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onRenameSession,
  onDeleteSession,

  activeChatMode,
  onChangeChatMode,

  currentLocationId,
  currentLayer,
  fullScreen = false,

}: Props) {
  const router = useRouter();

  /* =========================
     キャラ一覧（locationで絞る）
  ========================= */

  const visibleCharacters = useMemo(() => {
    if (!currentLocationId) return [];
    return Object.values(characters).filter(
      (c) => c.world?.location === currentLocationId
    );
  }, [characters, currentLocationId]);

  /* =========================
     キャラ選択アコーディオン
  ========================= */

  const [isCharacterOpen, setIsCharacterOpen] = useState(true);

  /* =========================
     Session edit state
  ========================= */

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const startEdit = (s: SessionSummary) => {
    setEditingSessionId(s.id);
    setEditingTitle(s.title);
  };

  const commitEdit = (s: SessionSummary) => {
    const t = editingTitle.trim();
    if (t && t !== s.title) {
      onRenameSession(s.id, t);
    }
    setEditingSessionId(null);
    setEditingTitle("");
  };

  const cancelEdit = () => {
    setEditingSessionId(null);
    setEditingTitle("");
  };

  /* =========================
     ★統一挙動：
     キャラ選択したら即チャット起動（session が無ければ作る）
     PC / Tablet / Mobile すべて同じ
  ========================= */

  const handleSelectCharacter = (id: string) => {
    onSelectCharacter(id);

    // 既にセッションが無い場合だけ即作成
    if (!activeSessionId) {
      onCreateSession();
    }
  };

  // 現在「︙（三点メニュー）」が開いている会話セッションのID
  // null のときは、どのメニューも開いていない状態
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  /* ========================= */

  return (
    <aside
      className={cn(
        "gensou-sidebar h-full relative z-10 flex flex-col p-4",
        fullScreen ? "w-full" : "w-72"
      )}
    >
      {/* ===== Title ===== */}
      <div className="mb-4 px-2">
        <h1 className="font-gensou text-xl tracking-wide text-white/90">
          Touhou Talk
        </h1>
        <p className="mt-1 text-xs text-white/50">幻想郷対話記録</p>
      </div>

      {/* ===== Chat mode (per session) ===== */}
      {activeSessionId && onChangeChatMode && (
        <div className="mb-4 px-2">
          <div className="mb-2 text-xs text-white/50">会話モード</div>
          <select
            value={activeChatMode ?? "partner"}
            onChange={(e) =>
              onChangeChatMode(
                e.target.value === "roleplay"
                  ? "roleplay"
                  : e.target.value === "coach"
                    ? "coach"
                    : "partner",
              )
            }
            className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white/90 outline-none hover:bg-black/60"
          >
            <option value="partner">相棒（バランス）</option>
            <option value="roleplay">ロールプレイ（再現優先）</option>
            <option value="coach">コーチ（実用優先）</option>
          </select>
          <p className="mt-2 text-[11px] leading-relaxed text-white/40">
            ※ モードはセッションごとに保存され、次の送信から反映されます。
          </p>
        </div>
      )}

      {/* ==================================================
          ① マップに戻る
         ================================================== */}
      {currentLocationId && (
        <button
          onClick={() =>
            router.push(
              currentLayer ? `/map/session/${currentLayer}` : "/map/session"
            )
          }
          className="mx-2 mb-4 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-left text-sm text-white/80 hover:bg-black/60"
        >
          ← マップに戻る
        </button>
      )}

      {/* ==================================================
          ② キャラ選択
         ================================================== */}
      {visibleCharacters.length > 0 && (
        <div className="mb-4 px-2">
          <button
            onClick={() => setIsCharacterOpen((v) => !v)}
            className="mb-2 flex w-full items-center justify-between text-xs text-white/50"
          >
            <span>キャラ選択</span>
            <span className="text-white/40">{isCharacterOpen ? "▲" : "▼"}</span>
          </button>

          {isCharacterOpen && (
            <div className="flex flex-col gap-2">
              {visibleCharacters.map((ch) => {
                const active = ch.id === activeCharacterId;

                return (
                  <button
                    key={ch.id}
                    onClick={() => handleSelectCharacter(ch.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition",
                      active
                        ? "border-white/40 bg-white/10"
                        : "border-white/10 hover:border-white/30"
                    )}
                  >
                    <div className="font-gensou text-sm text-white">
                      {ch.name}
                    </div>
                    <div className="text-xs text-white/60">{ch.title}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================================================
          ③ 会話履歴
         ================================================== */}
      <div className="mb-4 flex flex-col gap-2 px-2">
        <div className="flex items-center justify-between text-xs text-white/50">
          <span>会話履歴</span>
          <button
            onClick={onCreateSession}
            className="rounded border border-white/20 px-2 py-0.5 hover:bg-white/10"
          >
            ＋
          </button>
        </div>

        {sessions.map((s) => {
          const active = s.id === activeSessionId;
          const editing = s.id === editingSessionId;

          return (
            <div
              key={s.id}
              className={cn(
                "group relative rounded-lg border px-3 py-2 transition",
                active
                  ? "border-white/40 bg-white/15"
                  : "border-white/10 hover:border-white/30 hover:bg-white/5"
              )}
            >
              {/* アクティブ帯 */}
              {active && (
                <span className="absolute left-0 top-0 h-full w-1 rounded-l bg-white/60" />
              )}

              <div className="flex items-start justify-between gap-2">
                {/* タイトル */}
                <button
                  onClick={() => onSelectSession(s.id)}
                  className="flex-1 text-left"
                >
                  <div className="truncate text-sm text-white leading-snug">
                    {s.title}
                  </div>
                </button>

                {/* 三点メニュー */}
                <button
                  onClick={() =>
                    setMenuOpenId(menuOpenId === s.id ? null : s.id)
                  }
                  className="text-white/40 hover:text-white"
                >
                  ⋮
                </button>
              </div>

              {/* メニュー */}
              {menuOpenId === s.id && (
                <div className="absolute right-2 top-8 z-20 w-28 rounded-md border border-white/20 bg-black/80 text-sm backdrop-blur">
                  <button
                    onClick={() => {
                      startEdit(s);
                      setMenuOpenId(null);
                    }}
                    className="block w-full px-3 py-2 text-left text-white hover:bg-white/10"
                  >
                    タイトル編集
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpenId(null);
                      if (confirm("この会話を削除しますか？")) {
                        onDeleteSession(s.id);
                      }
                    }}
                    className="block w-full px-3 py-2 text-left text-red-400 hover:bg-white/10"
                  >
                    削除
                  </button>
                </div>
              )}

              {/* 編集中 */}
              {editing && (
                <input
                  value={editingTitle}
                  autoFocus
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={() => commitEdit(s)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit(s);
                    if (e.key === "Escape") cancelEdit();
                  }}
                  className="mt-2 w-full rounded bg-black/40 px-2 py-1 text-white outline-none"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* ===== Footer ===== */}
      <div className="mt-auto border-t border-white/10 pt-3 text-xs text-white/40">
        © Touhou Talk
      </div>
    </aside>
  );
}
