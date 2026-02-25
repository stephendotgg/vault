import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { TitleBar } from "./components/TitleBar";
import { AppShell } from "./components/AppShell";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vault",
  description: "A Notion-like workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} antialiased`}>
        <div className="flex flex-col h-screen w-screen overflow-hidden">
          <TitleBar />
          <div className="h-px bg-[#2f2f2f] shrink-0" />
          <AppShell />
        </div>
      </body>
    </html>
  );
}
