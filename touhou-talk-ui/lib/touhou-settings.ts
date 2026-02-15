"use client";

export type TouhouTheme = "light" | "dark" | "sigmaris" | "soft";

const KEY_SKIP_MAP = "touhouTalk.skipMapOnStart";
const KEY_THEME = "touhouTalk.theme";

export function getSkipMapOnStart(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY_SKIP_MAP) === "1";
}

export function setSkipMapOnStart(v: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_SKIP_MAP, v ? "1" : "0");
}

export function getTheme(): TouhouTheme {
  if (typeof window === "undefined") return "dark";
  const v = window.localStorage.getItem(KEY_THEME);
  if (v === "light" || v === "dark" || v === "sigmaris" || v === "soft")
    return v;
  return "dark";
}

export function setTheme(theme: TouhouTheme) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_THEME, theme);
}

export function applyThemeClass(theme: TouhouTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("dark", "sigmaris", "soft");

  if (theme === "dark") root.classList.add("dark");
  if (theme === "sigmaris") root.classList.add("dark", "sigmaris");
  if (theme === "soft") root.classList.add("soft");
}

