import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Time Capsule — Preserve today, open tomorrow", description: "Save the moments that matter. Give them a future date, and meet them again when the time is right." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
