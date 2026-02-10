"use client";

import { cn } from "@/lib/utils";

/* =========================
   Types
========================= */

export type SessionItem = {
  sessionId: string;
};

type Props = {
  sessions: SessionItem[];
  activeSessionId: string | null;

  onSelect: (sessionId: string) => void;
  onCreate: () => void;
};

/* =========================
   Component
========================= */

export default function SessionList({
  sessions,
  activeSessionId,
  onSelect,
  onCreate,
}: Props) {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-white/10 bg-black/60 backdrop-blur">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="text-sm font-semibold text-white/90">セッション</div>

        <button
          onClick={onCreate}
          className="rounded-md border border-white/20 px-2 py-1 text-xs text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          ＋ 新規
        </button>
      </div>

      {/* リスト */}
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        {sessions.length === 0 && (
          <div className="px-2 py-3 text-xs text-white/40">
            セッションがありません
          </div>
        )}

        {sessions.map((session) => {
          const active = session.sessionId === activeSessionId;

          return (
            <button
              key={session.sessionId}
              onClick={() => onSelect(session.sessionId)}
              className={cn(
                "group flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition",
                active
                  ? "bg-white/15 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              {/* 左マーカー */}
              <span
                className={cn(
                  "mr-2 h-2 w-2 rounded-full",
                  active ? "bg-cyan-300" : "bg-white/20 group-hover:bg-white/40"
                )}
              />

              {/* sessionId（短縮表示） */}
              <span className="truncate">
                {shortenSessionId(session.sessionId)}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

/* =========================
   Utils
========================= */

function shortenSessionId(id: string) {
  // UUID前提：先頭8文字だけ表示
  return id.length > 8 ? id.slice(0, 8) : id;
}
