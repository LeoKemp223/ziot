import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZIOT Console",
  description: "Small-to-medium IoT device cloud platform",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var m=document.cookie.match(/(?:^|; )ziot-theme=(dark|light)/);var t=localStorage.getItem('ziot-theme')||(m&&m[1])||'light';var c=localStorage.getItem('ziot-sidebar-collapsed')==='true';document.documentElement.dataset.theme=t;document.documentElement.dataset.sidebarCollapsed=String(c);document.documentElement.classList.toggle('dark',t==='dark')}catch{}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
