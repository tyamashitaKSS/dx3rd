import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DX3rd Combat Board",
  description: "Shared battle engage board for Double Cross 3rd Edition.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
