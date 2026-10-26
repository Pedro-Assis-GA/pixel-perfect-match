import { useEffect, useState } from "react";

const KEY = "skinscope:favorites";

function read(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function useFavorites() {
  const [favs, setFavs] = useState<string[]>([]);
  useEffect(() => {
    setFavs(read());
    const h = () => setFavs(read());
    window.addEventListener("skinscope:fav", h);
    return () => window.removeEventListener("skinscope:fav", h);
  }, []);
  const toggle = (name: string) => {
    const cur = read();
    const next = cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name];
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("skinscope:fav"));
  };
  return { favs, toggle, has: (n: string) => favs.includes(n) };
}
