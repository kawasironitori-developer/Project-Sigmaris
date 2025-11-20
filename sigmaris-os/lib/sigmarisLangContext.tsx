"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

type Lang = "ja" | "en";

interface SigmarisLangContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const SigmarisLangContext = createContext<SigmarisLangContextType | null>(null);

export function useSigmarisLang() {
  const ctx = useContext(SigmarisLangContext);
  if (!ctx)
    throw new Error("useSigmarisLang must be used within SigmarisLangProvider");
  return ctx;
}

export function SigmarisLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("ja");
  return (
    <SigmarisLangContext.Provider value={{ lang, setLang }}>
      {children}
    </SigmarisLangContext.Provider>
  );
}
