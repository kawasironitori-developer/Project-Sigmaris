"use client";

import { useEffect } from "react";

function setVar(name: string, value: number) {
  const root = document.documentElement;
  root.style.setProperty(name, `${Math.max(0, Math.floor(value))}px`);
}

/**
 * Mobile virtual keyboard / viewport stabilization helper.
 *
 * - Keeps layout stable (avoid dvh-induced jumps)
 * - Exposes CSS vars:
 *   - --touhou-vv-height: visualViewport.height (px)
 *   - --touhou-kbd: estimated keyboard height (px)
 *
 * Use cases:
 * - sticky headers remain stable
 * - sticky composer can add bottom padding when keyboard is open
 */
export function ViewportVars() {
  useEffect(() => {
    const vv = window.visualViewport;

    const update = () => {
      const innerH = window.innerHeight || 0;
      const clientH = document.documentElement?.clientHeight || 0;
      const baseH = Math.max(innerH, clientH);

      if (!vv) {
        setVar("--touhou-vv-height", innerH);
        setVar("--touhou-kbd", 0);
        return;
      }

      const vvHeight = vv.height || 0;

      // Keyboard estimation notes:
      // - `visualViewport.height` shrinks when the software keyboard opens.
      // - Small diffs can happen due to browser UI (address bar). We threshold to avoid jitter.
      const raw = Math.max(0, baseH - vvHeight);
      const keyboard = raw >= 120 ? raw : 0;

      setVar("--touhou-vv-height", vvHeight);
      setVar("--touhou-kbd", keyboard);
    };

    update();

    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("orientationchange", update, { passive: true } as any);
    vv?.addEventListener("resize", update, { passive: true });
    vv?.addEventListener("scroll", update, { passive: true });

    return () => {
      window.removeEventListener("resize", update as any);
      window.removeEventListener("orientationchange", update as any);
      vv?.removeEventListener("resize", update as any);
      vv?.removeEventListener("scroll", update as any);
    };
  }, []);

  return null;
}
