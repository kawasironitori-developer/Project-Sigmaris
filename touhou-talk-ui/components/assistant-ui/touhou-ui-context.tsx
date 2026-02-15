"use client";

import { createContext, useContext } from "react";

type Character = {
  id: string;
  name?: string;
  color?: {
    accent?: string;
  };
  ui?: {
    avatar?: string;
  };
};

type SessionSummary = {
  id: string;
  characterId: string;
};

export type TouhouUiContextValue = {
  activeSessionId: string | null;
  sessions: SessionSummary[];
  characters: Record<string, Character>;
};

const TouhouUiContext = createContext<TouhouUiContextValue | null>(null);

export function TouhouUiProvider({
  value,
  children,
}: {
  value: TouhouUiContextValue;
  children: React.ReactNode;
}) {
  return (
    <TouhouUiContext.Provider value={value}>{children}</TouhouUiContext.Provider>
  );
}

export function useTouhouUi() {
  const ctx = useContext(TouhouUiContext);
  if (!ctx) throw new Error("useTouhouUi must be used within TouhouUiProvider");
  return ctx;
}
