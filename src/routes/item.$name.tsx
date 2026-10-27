import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ExternalLink, Info } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/market/AppShell";
import { FavButton, Money, Pct, SkinportStaleNotice, Updated } from "@/components/market/bits";
import { getItem } from "@/lib/market/market.functions";
import { brl, CATEGORY_LABEL, effectiveBuyCost, FEES, netAfterSale, pctDiff } from "@/lib/market/parse";

const itemQ = (name: string) =>
  queryOptions({ queryKey: ["item", name], queryFn: () => getItem({ data: { name } }), staleTime: 60_000 });

export const Route = createFileRoute("/item/$name")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.name} — preço e comparação | SkinScope` },
      { name: "description", content: `Preço atual de ${params.name} na Skinport e Steam, com taxas e histórico de vendas.` },
      { property: "og:title", content: `${params.name} — SkinScope` },
      { property: "og:description", content: `Compare ${params.name} entre marketplaces com custo efetivo.` },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(itemQ(params.name)),
  component: ItemPage,
  errorComponent: ({ error }) => (
    <AppShell><div className="panel p-6 text-sm">Não foi possível carregar este item: {error instanceof Error ? error.message : String(error)}</div></AppShell>
  ),
});

function ItemPage() {
  const { name } = Route.useParams();
  const { data } = useSuspenseQuery(itemQ(name));
  const sp = data.skinport;
  const st = data.steam;

  const rows = [
    {
      market: "Skinport",
      price: sp?.min ?? null,
      fee: FEES.skinport,
      url: sp?.url,
      ts: data.fetchedAt as number | null,
      extra: sp ? `${sp.quantity} anúncios` : null,
    },
    {
      market: "Steam Market",
      price: st?.lowest ?? null,
      fee: FEES.steam,
      url: st?.url,
      ts: data.steamFetchedAt as number | null,
      extra: st?.volume24h != null ? `${st.volume24h} vendas/24h` : null,
    },
  ];
  const cheapest = Math.min(...rows.map((r) => r.price ?? Infinity));

  const periods = data.history
    ? ([
        ["24h", data.history.last_24_hours],
        ["7 dias", data.history.last_7_days],
        ["30 dias", data.history.last_30_days],
        ["90 dias", data.history.last_90_days],
      ] as const)
    : [];

  return (
    <AppShell>
      <Link to="/busca" className="text-xs text-muted-foreground hover:text-primary">← Pesquisa</Link>
      <div className="mt-3 grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="panel flex aspect-square items-center justify-center bg-hero p-6">
          {st?.image ? (
            <img src={st.image} alt={name} className="max-h-full max-w-full object-contain drop-shadow-2xl" onError={(e) => (e.currentTarget.style.display = "none")} />
          ) : (
            <span className="text-xs text-muted-foreground">Imagem indisponível</span>
          )}
        </div>
        <div>
          <div className="flex items-start gap-2">
            <h1 className="text-3xl font-bold">{name}</h1>
            <FavButton name={name} />
          </div>
          {sp && (
            <p className="mt-1 text-sm text-muted-foreground">
              {CATEGORY_LABEL[sp.category]} {sp.exterior && `· ${sp.exterior}`} {sp.stattrak && "· StatTrak™"} {sp.souvenir && "· Souvenir"}
            </p>
          )}
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Box label="Menor anúncio Skinport"><Money v={sp?.min} className="text-xl font-bold text-primary" /></Box>
            <Box label="Referência Skinport"><Money v={sp?.suggested} className="text-xl font-bold" /></Box>
            <Box label="Menor Steam"><Money v={st?.lowest} className="text-xl font-bold" /></Box>
            <Box label="Mediana Steam 24h"><Money v={st?.median} className="text-xl font-bold" /></Box>
          </div>
          {sp?.min != null && sp.suggested != null && (
            <p className="mt-3 text-sm">
              Menor anúncio está <Pct v={pctDiff(sp.min, sp.suggested)} /> em relação à referência da Skinport. Isso não garante oportunidade — confira float, adesivos e pattern no anúncio.
            </p>
          )}
        </div>
      </div>

      <section className="panel mt-8 overflow-x-auto p-5">
        <h2 className="text-xl font-bold">Comparador entre marketplaces</h2>
        <SkinportStaleNotice stale={data.skinportStale} ts={data.fetchedAt} />
        <SteamNotice status={data.steamStatus} fetchedAt={data.steamFetchedAt} retryAt={data.steamRetryAt} />
        <p className="mb-4 text-xs text-muted-foreground">Preços em BRL informados pelas próprias fontes (sem conversão). Taxas públicas de cada plataforma.</p>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr className="border-b border-border">
              <th className="p-2">Marketplace</th><th className="p-2 text-right">Anúncio</th><th className="p-2 text-right">Custo de compra</th><th className="p-2 text-right">Δ vs. mais barato</th><th className="p-2 text-right">Líquido se revender</th><th className="p-2">Saldo</th><th className="p-2">Atualizado</th><th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.market} className="border-b border-border/50 align-top">
                <td className="p-2 font-semibold">{r.market}<div className="text-xs font-normal text-muted-foreground">{r.extra}</div></td>
                <td className="p-2 text-right"><Money v={r.price} /></td>
                <td className="p-2 text-right">{r.price != null ? <Money v={effectiveBuyCost(r.price, r.fee)} className="text-primary" /> : "—"}</td>
                <td className="p-2 text-right">{r.price != null && isFinite(cheapest) ? <Pct v={pctDiff(r.price, cheapest)} /> : "—"}</td>
                <td className="p-2 text-right">{r.price != null ? <Money v={netAfterSale(r.price, r.fee)} /> : "—"}<div className="text-[10px] text-muted-foreground">taxa {r.fee.sellerFeePct}%</div></td>
                <td className="p-2">
                  <span className={`rounded-sm px-1.5 py-0.5 text-[10px] uppercase ${r.fee.cashOut ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                    {r.fee.cashOut ? "Sacável" : "Só carteira Steam"}
                  </span>
                </td>
                <td className="p-2">{r.ts != null ? <Updated ts={r.ts} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                <td className="p-2">{r.url && <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Abrir <ExternalLink className="h-3 w-3" /></a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
          {rows.map((r) => <li key={r.market} className="flex gap-1"><Info className="mt-0.5 h-3 w-3 shrink-0" /><b>{r.market}:</b> {r.fee.note}</li>)}
          <li className="flex gap-1"><Info className="mt-0.5 h-3 w-3 shrink-0" />Custos de saque, IOF e tempo de trade-lock não estão incluídos.</li>
        </ul>
      </section>

      <OpenSkinSection o={data.openskin} />

      <section className="panel mt-6 p-5">
        <h2 className="text-xl font-bold">Histórico de vendas (Skinport)</h2>
        <p className="mb-4 text-xs text-muted-foreground">Vendas efetivamente concluídas, agregadas por período. A Skinport não expõe série diária; não estimamos pontos intermediários.</p>
        {periods.length && periods.some(([, p]) => p.volume > 0) ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              {periods.map(([label, p]) => (
                <div key={label} className="rounded-sm border border-border p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
                  <div className="num mt-1 text-lg font-bold">{p.median != null ? brl.format(p.median) : "—"}</div>
                  <div className="text-xs text-muted-foreground">mediana · {p.volume} vendas</div>
                  <div className="num mt-1 text-xs text-muted-foreground">{p.min != null ? `${brl.format(p.min)} – ${brl.format(p.max!)}` : "sem vendas"}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 h-56">
              <ResponsiveContainer>
                <BarChart data={periods.map(([l, p]) => ({ l, mediana: p.median, media: p.avg })).reverse()}>
                  <XAxis dataKey="l" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip formatter={(v: number) => brl.format(v)} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }} cursor={{ fill: "var(--accent)" }} />
                  <Bar dataKey="mediana" name="Mediana" fill="var(--chart-1)" />
                  <Bar dataKey="media" name="Média" fill="var(--chart-2)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Sem vendas registradas suficientes para este item.</p>
        )}
      </section>

      {data.variants.length > 0 && (
        <section className="panel mt-6 p-5">
          <h2 className="text-xl font-bold">Outras versões desta skin</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.variants.map((v) => (
              <Link key={v.name} to="/item/$name" params={{ name: v.name }} className="flex justify-between rounded-sm border border-border p-3 text-sm hover:border-primary">
                <span>{v.stattrak && "ST™ "}{v.exterior ?? v.name}</span>
                <Money v={v.min} className="text-primary" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}

function Box({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="panel p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function SteamNotice({ status, fetchedAt, retryAt }: { status: string; fetchedAt: number | null; retryAt: number | null }) {
  if (status === "ok") return null;
  const retry = retryAt ? Math.max(1, Math.ceil((retryAt - Date.now()) / 60000)) : null;
  const msg =
    status === "stale"
      ? `Steam temporariamente indisponível. Exibindo o último preço obtido (${fetchedAt ? new Date(fetchedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "?"}), que pode estar desatualizado.`
      : status === "rate_limited"
        ? "A Steam limitou as consultas (HTTP 429). Sem preço em cache para este item."
        : status === "not_found"
          ? "A Steam não retornou preço para este item."
          : "Steam indisponível no momento. Sem preço em cache para este item.";
  return (
    <div role="status" className="mb-3 flex gap-2 rounded-sm border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
      <Info className="mt-0.5 h-3 w-3 shrink-0" />
      <span>{msg}{retry && status !== "not_found" ? ` Nova tentativa em ~${retry} min.` : ""}</span>
    </div>
  );
}

const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });
function OpenSkinSection({ o }: { o: { markets: { market: string; ask: number | null; bid: number | null; median: number | null; listings: number | null; volume24h: number | null; currency: string; updatedAt: string | null; url: string | null }[]; status: string; fetchedAt: number | null } }) {
  const fmt = (v: number | null, c: string) => (v == null ? "—" : c === "USD" ? usd.format(v) : `${v.toFixed(2)} ${c}`);
  return (
    <section className="panel mt-6 overflow-x-auto p-5">
      <h2 className="text-xl font-bold">Outros marketplaces (via OpenSkin)</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Preços agregados na <b>moeda original (USD)</b>, sem conversão para BRL. Não comparar diretamente com os valores em R$ acima.
      </p>
      {o.status === "stale" && (
        <div role="status" className="mb-3 rounded-sm border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
          OpenSkin indisponível. Exibindo últimos dados obtidos{o.fetchedAt ? ` (${new Date(o.fetchedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})` : ""}, que podem estar desatualizados.
        </div>
      )}
      {o.markets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {o.status === "not_found" ? "A OpenSkin não retornou preços para este item." : "OpenSkin indisponível no momento. Nenhum preço exibido."}
        </p>
      ) : (
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr className="border-b border-border">
              <th className="p-2">Marketplace</th><th className="p-2 text-right">Menor anúncio</th><th className="p-2 text-right">Maior oferta de compra</th><th className="p-2 text-right">Mediana</th><th className="p-2 text-right">Anúncios</th><th className="p-2 text-right">Vendas 24h</th><th className="p-2">Atualizado</th><th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {o.markets.map((m) => (
              <tr key={m.market} className="border-b border-border/50">
                <td className="p-2 font-semibold">{m.market}</td>
                <td className="num p-2 text-right">{fmt(m.ask, m.currency)}</td>
                <td className="num p-2 text-right">{fmt(m.bid, m.currency)}</td>
                <td className="num p-2 text-right">{fmt(m.median, m.currency)}</td>
                <td className="num p-2 text-right">{m.listings ?? "—"}</td>
                <td className="num p-2 text-right">{m.volume24h ?? "—"}</td>
                <td className="p-2">{m.updatedAt ? <Updated ts={Date.parse(m.updatedAt)} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                <td className="p-2">{m.url && <a href={m.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Abrir <ExternalLink className="h-3 w-3" /></a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
