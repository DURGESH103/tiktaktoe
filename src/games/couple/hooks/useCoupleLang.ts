"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lang } from "../types";

/** Per-player question language (English / Hinglish), remembered on this device. */
export function useCoupleLang() {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    try {
      if (localStorage.getItem("couple-lang") === "hi") setLangState("hi");
    } catch {}
  }, []);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("couple-lang", l);
    } catch {}
  }, []);
  return [lang, setLang] as const;
}
