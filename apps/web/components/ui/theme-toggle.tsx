"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.dataset.theme === "dark");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  function toggle() {
    const next = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = next ? "dark" : "light";
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("ziot-theme", next ? "dark" : "light");
    document.cookie = `ziot-theme=${next ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
  }

  return <button aria-label={dark ? "切换到白天模式" : "切换到黑夜模式"} className="theme-toggle flex h-9 w-9 items-center justify-center rounded-md border" onClick={toggle} type="button">{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>;
}
