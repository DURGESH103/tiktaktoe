"use client";

import { MotionConfig } from "framer-motion";
import { AuthGate } from "./AuthGate";
import { AuthProvider } from "./AuthProvider";
import { PwaManager } from "./PwaManager";
import { SettingsProvider } from "./SettingsProvider";
import { ThemeProvider } from "./ThemeProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SettingsProvider>
        {/* Honour prefers-reduced-motion for every Framer Motion animation. */}
        <MotionConfig reducedMotion="user">
          <AuthProvider>
            <AuthGate>{children}</AuthGate>
          </AuthProvider>
          <PwaManager />
        </MotionConfig>
      </SettingsProvider>
    </ThemeProvider>
  );
}
