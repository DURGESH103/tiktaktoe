import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import { Providers } from "@/components/providers/Providers";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Outfit({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Tiktoe — play with friends", template: "%s · Tiktoe" },
  description: "Real-time Tic-Tac-Toe with your friends. Share a link and play.",
  appleWebApp: { capable: true, title: "Tiktoe", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#080914" },
    { media: "(prefers-color-scheme: light)", color: "#f2f3fa" },
  ],
};

// Applies the saved theme before first paint (dark by default) to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('theme');if(t!=='light')document.documentElement.classList.add('dark')}catch(e){document.documentElement.classList.add('dark')}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="app-bg" aria-hidden />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
