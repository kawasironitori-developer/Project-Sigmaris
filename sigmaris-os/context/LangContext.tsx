"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

type Lang = "ja" | "en";

interface LangContextProps {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const LanguageContext = createContext<LangContextProps | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("ja");
  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context)
    throw new Error("useLanguage must be used within a LanguageProvider");
  return context;
}
