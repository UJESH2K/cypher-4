import type { Metadata, Viewport } from "next";
import "@fontsource-variable/anek-latin/wdth.css";
import "@fontsource-variable/anek-devanagari/wdth.css";
import "@fontsource-variable/anek-kannada/wdth.css";
import "@fontsource-variable/anek-tamil/wdth.css";
import "@fontsource-variable/anek-telugu/wdth.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kaveri Desk",
  description:
    "An AI purchasing colleague for Kaveri Spares & Hydraulics: it reads stock, sales, suppliers and purchase orders, compares the options and drafts the next action for a person to approve.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#15232D" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
