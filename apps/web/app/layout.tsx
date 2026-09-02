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
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var m=document.cookie.match(/(?:^|; )ziot-theme=(dark|light)/);var t=localStorage.getItem('ziot-theme')|| (m&&m[1]) || 'light';document.documentElement.dataset.theme=t;document.documentElement.classList.toggle('dark',t==='dark')}catch{}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
