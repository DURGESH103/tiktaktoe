"use client";

import { createPortal } from "react-dom";

/**
 * Renders children into <body>. Fixed-position overlays need this: inside a transformed
 * ancestor (e.g. the game column sliding left for the chat panel), `position: fixed`
 * is relative to that ancestor instead of the screen.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
