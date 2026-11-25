import type { Metadata, Viewport } from "next";
import "@fontsource/im-fell-english/400.css";
import "@fontsource/im-fell-english/400-italic.css";
import "@fontsource-variable/alegreya/wght.css";
import "@fontsource/alegreya-sc/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas Drift",
  description: "A geography game: five prompts, one pin each. The less obvious your correct answer, the further you travel.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1e9d6" },
    { media: "(prefers-color-scheme: dark)", color: "#1f1a15" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
