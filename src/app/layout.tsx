import type { Metadata, Viewport } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";

const serif = Playfair_Display({ subsets: ["latin"], variable: "--font-serif" });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
export const metadata: Metadata = { title: "WeddingSnap — every guest's photos, one gallery", description: "Share a QR code. Guests upload wedding photos from their phones. No app needed." };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en" className={`${serif.variable} ${sans.variable}`}><body>{children}</body></html>);
}
