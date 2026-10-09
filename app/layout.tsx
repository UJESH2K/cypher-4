import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/anek-devanagari/wdth.css";
import "@fontsource-variable/anek-kannada/wdth.css";
import "@fontsource-variable/anek-tamil/wdth.css";
import "@fontsource-variable/anek-telugu/wdth.css";
import "./globals.css";
import { LANG_COOKIE, langFrom } from "@/lib/lang-cookie";

export const metadata: Metadata = {
  title: "Kaveri Desk",
  description:
    "An AI purchasing colleague for Kaveri Spares & Hydraulics: it reads stock, sales, suppliers and purchase orders, compares the options and drafts the next action for a person to approve.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0d0c" },
  ],
};

// Sets the theme before the first paint so a dark-mode user never sees a white flash.
const THEME_SCRIPT = `try{var t=localStorage.getItem("kd-theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = langFrom((await cookies()).get(LANG_COOKIE)?.value);
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
