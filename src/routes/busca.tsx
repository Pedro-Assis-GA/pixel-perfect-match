import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { LayoutGrid, List, Share2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/market/AppShell";
import {
  FavButton,
  Money,
  Pct,
  SkinCard,
  SkinportStaleNotice,
  Updated,
} from "@/components/market/bits";
import { searchSchema, searchSkins, type SearchParams } from "@/lib/market/market.functions";
import { CATEGORIES, CATEGORY_LABEL, EXTERIORS } from "@/lib/market/parse";

const urlSchema = searchSchema.extend({}).partial();

export const Route = createFileRoute("/busca")({
  validateSearch: (s: Record<string, unknown>): SearchParams => {
    const num = (v: unknown) => (v === undefined || v === "" ? undefined : Number(v));
    const bool = (v: unknown) =>
      v === true || v === "true" ? true : v === false || v === "false" ? false : undefined;
    const r = urlSchema.safeParse({
      ...s,
      min: num(s["min"]),
      max: num(s["max"]),
      page: num(s["page"]),
      stattrak: bool(s["stattrak"]),
      souvenir: bool(s["souvenir"]),
      q: s["q"] ? String(s["q"]) : undefined,
    });
    return r.success ? r.data : {};
  },
  head: () => ({
    meta: [
      { title: "Pesquisar skins CS2 — SkinScope" },
      {
        name: "description",
        content:
          "Busque e filtre skins do CS2 por categoria, desgaste, StatTrak e preço com dados reais.",
      },
      { property: "og:title", content: "Pesquisar skins CS2 — SkinScope" },
      {
        property: "og:description",
        content: "Filtros combináveis e preços reais de skins do CS2.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchPage,
});

const SORTS = {
  liquidity: "Mais anúncios",
  price_asc: "Menor preço",
  price_desc: "Maior preço",
  discount: "Maior desconto",
  updated: "Atualização recente",
} as const;

function SearchPage() {
  const sp = Route.useSearch();
  const navigate = useNavigate({ from: "/busca" });
  const [view, setView] = useState<"cards" | "table">("cards");
  const q = useQuery({
    queryKey: ["search", sp],
    queryFn: () => searchSkins({ data: sp }),
    placeholderData: keepPreviousData,
  });
  const set = (patch: Partial<SearchParams>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch, page: patch.page ?? undefined }) });

  const chips = (Object.entries(sp) as [keyof SearchParams, unknown][]).filter(
    ([k, v]) => v !== undefined && k !== "page" && k !== "sort",
  );

  return (
    <AppShell>
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="panel h-fit w-full shrink-0 space-y-4 p-4 lg:w-64">
          <h2 className="text-sm font-bold uppercase tracking-widest">Filtros</h2>
          <Field label="Nome">
            <input
              defaultValue={sp.q}
              key={sp.q}
              onKeyDown={(e) => e.key === "Enter" && set({ q: e.currentTarget.value || undefined })}
              onBlur={(e) =>
                e.currentTarget.value !== (sp.q ?? "") &&
                set({ q: e.currentTarget.value || undefined })
              }
              placeholder="ex: redline"
              className="inp"
            />
          </Field>
          <Field label="Tipo de item">
            <select
              className="inp"
              value={sp.category ?? ""}
              onChange={(e) =>
                set({ category: (e.target.value || undefined) as SearchParams["category"] })
              }
            >
              <option value="">Todos</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Exterior">
            <select
              className="inp"
              value={sp.exterior ?? ""}
              onChange={(e) =>
                set({ exterior: (e.target.value || undefined) as SearchParams["exterior"] })
              }
            >
              <option value="">Todos</option>
              {EXTERIORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Preço (US$)">
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                placeholder="mín"
                defaultValue={sp.min}
                key={`min${sp.min}`}
                className="inp"
                onBlur={(e) => set({ min: e.target.value ? Number(e.target.value) : undefined })}
              />
              <input
                type="number"
                min={0}
                placeholder="máx"
                defaultValue={sp.max}
                key={`max${sp.max}`}
                className="inp"
                onBlur={(e) => set({ max: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
          </Field>
          <Field label="Versão">
            <select
              className="inp"
              value={
                sp.stattrak
                  ? "st"
                  : sp.souvenir
                    ? "sv"
                    : sp.stattrak === false && sp.souvenir === false
                      ? "normal"
                      : ""
              }
              onChange={(e) => {
                const v = e.target.value;
                set({
                  stattrak: v === "st" ? true : v === "normal" ? false : undefined,
                  souvenir: v === "sv" ? true : v === "normal" ? false : undefined,
                });
              }}
            >
              <option value="">Todas</option>
              <option value="normal">Normal</option>
              <option value="st">StatTrak™</option>
              <option value="sv">Souvenir</option>
            </select>
          </Field>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Float, seed/pattern, adesivos aplicados e fase Doppler exigem dados por anúncio (ex.:
            CSFloat), ainda não integrados.{" "}
            <Link to="/fontes" className="text-primary">
              Saiba mais
            </Link>
          </p>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="num text-sm text-muted-foreground">
              {q.data ? `${q.data.total.toLocaleString("pt-BR")} resultados` : "Carregando…"}
            </span>
            {chips.map(([k, v]) => (
              <button
                key={k}
                onClick={() => set({ [k]: undefined })}
                className="flex items-center gap-1 rounded-sm bg-secondary px-2 py-1 text-xs hover:bg-accent"
              >
                {k}: {String(v)} <X className="h-3 w-3" />
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <select
                className="inp w-auto"
                value={sp.sort ?? "liquidity"}
                onChange={(e) => set({ sort: e.target.value as SearchParams["sort"] })}
              >
                {Object.entries(SORTS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
              <button
                aria-label="Cards"
                onClick={() => setView("cards")}
                className={`rounded-sm p-2 ${view === "cards" ? "bg-secondary text-primary" : "text-muted-foreground"}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                aria-label="Tabela"
                onClick={() => setView("table")}
                className={`rounded-sm p-2 ${view === "table" ? "bg-secondary text-primary" : "text-muted-foreground"}`}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                aria-label="Copiar link da busca"
                onClick={() => {
                  navigator.clipboard.writeText(location.href);
                  toast.success("Link da busca copiado");
                }}
                className="rounded-sm p-2 text-muted-foreground hover:text-primary"
              >
                <Share2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {q.data && (
            <SkinportStaleNotice
              stale={q.data.stale}
              ts={q.data.fetchedAt}
              source={q.data.source}
            />
          )}
          {q.isError && (
            <div className="panel p-6 text-sm">
              Falha ao consultar a Skinport. Tente novamente em instantes.
            </div>
          )}
          {q.isPending && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="panel h-36 animate-pulse" />
              ))}
            </div>
          )}
          {q.data && q.data.total === 0 && (
            <div className="panel p-6 text-sm text-muted-foreground">
              Nenhum item encontrado com esses filtros.
            </div>
          )}

          {q.data && view === "cards" && (
            <div
              className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 ${q.isFetching ? "opacity-60" : ""}`}
            >
              {q.data.items.map((r) => (
                <SkinCard key={r.name} r={r} />
              ))}
            </div>
          )}
          {q.data && view === "table" && q.data.total > 0 && (
            <div className="panel overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="p-2"></th>
                    <th className="p-2">Item</th>
                    <th className="p-2 text-right">Menor</th>
                    <th className="p-2 text-right">Referência</th>
                    <th className="p-2 text-right">Δ</th>
                    <th className="p-2 text-right">Anúncios</th>
                    <th className="p-2">Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map((r) => (
                    <tr key={r.name} className="border-b border-border/50 hover:bg-accent/40">
                      <td className="p-2">
                        <FavButton name={r.name} />
                      </td>
                      <td className="p-2">
                        <Link
                          to="/item/$name"
                          params={{ name: r.name }}
                          className="hover:text-primary"
                        >
                          {r.name}
                        </Link>
                      </td>
                      <td className="p-2 text-right">
                        <Money v={r.min} currency={r.currency} className="text-primary" />
                      </td>
                      <td className="p-2 text-right">
                        <Money v={r.suggested} currency={r.currency} />
                      </td>
                      <td className="p-2 text-right">
                        <Pct v={r.discountPct} />
                      </td>
                      <td className="num p-2 text-right">{r.quantity}</td>
                      <td className="p-2">
                        <Updated ts={r.updatedAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {q.data && q.data.pages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3 text-sm">
              <button
                disabled={q.data.page <= 1}
                onClick={() => set({ page: q.data!.page - 1 })}
                className="rounded-sm bg-secondary px-3 py-1.5 disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="num text-muted-foreground">
                {q.data.page} / {q.data.pages}
              </span>
              <button
                disabled={q.data.page >= q.data.pages}
                onClick={() => set({ page: q.data!.page + 1 })}
                className="rounded-sm bg-secondary px-3 py-1.5 disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
