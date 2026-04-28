import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZIOT Console",
  description: "Small-to-medium IoT device cloud platform"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
