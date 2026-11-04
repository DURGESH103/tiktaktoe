"use client";

import { useEffect, useState } from "react";

/**
 * Tracks the visible part of the screen via visualViewport (shrinks when the keyboard opens).
 * `keyboard`: px hidden at the bottom of the layout viewport (0 when closed).
 * `height`:   visible height in px.
 * `top`:      how far the visible area is scrolled within the layout viewport (iOS shifts it when typing).
 */
export function useVisualViewport() {
  const [state, setState] = useState({ keyboard: 0, height: 0, top: 0 });

  useEffect(() => {
    const vv = window.visualViewport;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const height = Math.round(vv?.height ?? window.innerHeight);
        const top = Math.round(vv?.offsetTop ?? 0);
        const keyboard = Math.max(0, Math.round(window.innerHeight - height - top));
        setState((s) => (s.keyboard === keyboard && s.height === height && s.top === top ? s : { keyboard, height, top }));
      });
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return state;
}
