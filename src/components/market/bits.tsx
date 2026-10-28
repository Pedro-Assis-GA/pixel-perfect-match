import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { usd, CATEGORY_LABEL, type Category } from "@/lib/market/parse";
import { useFavorites } from "@/lib/market/favorites";
import { cn } from "@/lib/utils";

export function Pct({ v, className }: { v: number | null | undefined; className?: string }) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("num", v < 0 ? "text-success" : v > 0 ? "text-destructive" : "text-muted-foreground", className)}>
      {v > 0 ? "+" : ""}
      {v.toFixed(1)}%
    </span>
  );
}

export function Money({ v, className, currency = "USD" }: { v: number | null | undefined; className?: string; currency?: string | undefined }) {
  if (v == null) return <span className="text-muted-foreground">indisponível</span>;
  return <span className={cn("num", className)}>{currency === "USD" ? usd.format(v) : `${v.toFixed(2)} ${currency}`}</span>;
}

export function Updated({ ts }: { ts: number }) {
  const ms = ts > 1e12 ? ts : ts * 1000;
  const min = Math.round((Date.now() - ms) / 60000);
  const stale = min > 60;
  return (
    <span className={cn("text-xs", stale ? "text-warning" : "text-muted-foreground")}>
      {min < 1 ? "agora" : min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.round(min / 60)} h` : `há ${Math.round(min / 1440)} d`}
      {stale && " · desatualizado"}
    </span>
  );
}

export function FavButton({ name }: { name: string }) {
  const { has, toggle } = useFavorites();
  const on = has(name);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        toggle(name);
      }}
      aria-label={on ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      className="rounded-sm p-1 text-muted-foreground hover:text-primary"
    >
      <Star className={cn("h-4 w-4", on && "fill-primary text-primary")} />
    </button>
  );
}

export interface RowLike {
  name: string;
  min: number | null;
  suggested?: number | null;
  quantity: number;
  category: Category;
  exterior: string | null;
  stattrak: boolean;
  souvenir: boolean;
  updatedAt: number;
  discountPct?: number | null;
  currency?: string | undefined;
}

export function SkinCard({ r }: { r: RowLike }) {
  return (
    <Link to="/item/$name" params={{ name: r.name }} className="panel group block p-4 transition-colors hover:border-primary">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {CATEGORY_LABEL[r.category]}
          {r.exterior && ` · ${r.exterior}`}
        </span>
        <FavButton name={r.name} />
      </div>
      <h3 className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm font-semibold group-hover:text-primary">
        {r.stattrak && <span className="text-primary">ST™ </span>}
        {r.souvenir && <span className="text-warning">Souvenir </span>}
        {r.name.replace(/StatTrak™ |^Souvenir /, "")}
      </h3>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Menor anúncio · Skinport (USD)</div>
          <Money v={r.min} currency={r.currency} className="text-lg font-bold text-primary" />
        </div>
        <div className="text-right text-xs">
          <div className="text-muted-foreground">vs. referência</div>
          <Pct v={r.discountPct} />
        </div>
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span className="num">{r.quantity} anúncios</span>
        <Updated ts={r.updatedAt} />
      </div>
    </Link>
  );
}

export function SkinportStaleNotice({ stale, ts, source }: { stale?: boolean; ts: number; source?: string | undefined }) {
  if (source === "openskin")
    return (
      <div role="status" className={cn("mb-4 rounded-sm border p-2 text-xs", stale ? "border-warning/40 bg-warning/10 text-warning" : "border-border bg-muted/40 text-muted-foreground")}>
        Fonte alternativa: preços da Skinport reportados pela OpenSkin (USD). Consulta à OpenSkin <Updated ts={ts} />{stale ? " — nova consulta falhou, dados podem estar desatualizados" : ""}.
      </div>
    );
  if (!stale) return null;
  return (
    <div role="status" className="mb-4 rounded-sm border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
      Skinport indisponível no momento. Exibindo os últimos dados obtidos (<Updated ts={ts} />), que podem não refletir os preços atuais.
    </div>
  );
}
