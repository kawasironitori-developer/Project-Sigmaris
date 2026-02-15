"use client";

import { useEffect } from "react";
import { applyThemeClass, getTheme } from "@/lib/touhou-settings";

export function TouhouThemeInit() {
  useEffect(() => {
    applyThemeClass(getTheme());
  }, []);

  return null;
}

