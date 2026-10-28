import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Crosshair, Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { suggestSkins } from "@/lib/market/market.functions";
import { usd } from "@/lib/market/parse";

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/busca", label: "Pesquisa" },
  { to: "/favoritos", label: "Favoritos" },
  { to: "/fontes", label: "Fontes de dados" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-hero">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-wider">
            <Crosshair className="h-5 w-5 text-primary" />
            SKIN<span className="text-primary">SCOPE</span>
          </Link>
          <nav className="flex gap-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.to === "/" }}
                className="rounded-sm px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-primary"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <GlobalSearch />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Somente leitura · Dados de Skinport e Steam Community Market · Não é recomendação de investimento
      </footer>
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<{ name: string; min: number | null }[]>([]);
  const suggest = useServerFn(suggestSkins);
  const navigate = useNavigate();
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(t.current);
    if (q.trim().length < 2) return setItems([]);
    t.current = setTimeout(() => {
      suggest({ data: { q } }).then(setItems).catch(() => setItems([]));
    }, 250);
  }, [q, suggest]);

  return (
    <form
      className="relative ml-auto w-full max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setOpen(false);
        navigate({ to: "/busca", search: { q: q || undefined } });
      }}
    >
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar skin (ex: AK-47 Redline)"
        aria-label="Buscar skin"
        className="h-9 w-full rounded-sm border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
      />
      {open && items.length > 0 && (
        <ul className="absolute z-40 mt-1 w-full overflow-hidden rounded-sm border border-border bg-popover shadow-lg">
          {items.map((i) => (
            <li key={i.name}>
              <Link
                to="/item/$name"
                params={{ name: i.name }}
                className="flex justify-between gap-2 px-3 py-2 text-sm hover:bg-accent"
              >
                <span className="truncate">{i.name}</span>
                {i.min != null && <span className="num text-primary">{usd.format(i.min)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
