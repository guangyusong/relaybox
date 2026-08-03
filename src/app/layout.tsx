import type { Metadata } from "next";
import "./globals.css";
import { publicAppName } from "@/lib/public-config";

export const metadata: Metadata = {
  title: publicAppName,
  description: "Open inbox workspace for AI agents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
