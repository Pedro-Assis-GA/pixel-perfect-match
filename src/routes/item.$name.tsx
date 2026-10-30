import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ExternalLink, Info } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/market/AppShell";
import { FavButton, Money, Pct, SkinportStaleNotice, Updated } from "@/components/market/bits";
import { getItem } from "@/lib/market/market.functions";
import {
  usd,
  CATEGORY_LABEL,
  effectiveBuyCost,
  FEES,
  netAfterSale,
  pctDiff,
} from "@/lib/market/parse";
import {
  hasAggregatePrices,
  itemIndicators,
  steamNoticeMode,
  usableDirectPrice,
  usableOpenSkinMarkets,
  usablePriceTime,
  directPriceComparisonBaseline,
  type ItemIndicator,
} from "@/components/market/item-presentation";

const itemQ = (name: string) =>
  queryOptions({
    queryKey: ["item", name],
    queryFn: () => getItem({ data: { name } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/item/$name")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.name} — preço e comparação | SkinScope` },
      {
        name: "description",
        content: `Preço atual de ${params.name} na Skinport e Steam, com taxas e histórico de vendas.`,
      },
      { property: "og:title", content: `${params.name} — SkinScope` },
      {
        property: "og:description",
        content: `Compare ${params.name} entre marketplaces com custo efetivo.`,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(itemQ(params.name)),
  component: ItemPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="panel p-6 text-sm">
        Não foi possível carregar este item:{" "}
        {error instanceof Error ? error.message : String(error)}
      </div>
    </AppShell>
  ),
});

function ItemPage() {
  const { name } = Route.useParams();
  const { data } = useSuspenseQuery(itemQ(name));
  // Protect the page even if an adapter still returns an old cached quote.
  const nowMs = Date.now();
  const sp =
    data.skinport &&
    usablePriceTime(data.fetchedAt, nowMs) &&
    usablePriceTime(data.skinport.updatedAt * 1000, nowMs)
      ? data.skinport
      : null;
  const st = data.steam
    ? {
        ...data.steam,
        lowest: usableDirectPrice(data.steam.lowest, data.steamFetchedAt, nowMs),
        median: usableDirectPrice(data.steam.median, data.steamFetchedAt, nowMs),
      }
    : null;
  const markets = usableOpenSkinMarkets(data.openskin.markets, data.openskin.fetchedAt, nowMs);
  const openSkin = { ...data.openskin, markets };
  const image = st?.image ?? data.openskin.icon;
  const hasAlternatives = hasAggregatePrices(markets);
  const indicators = itemIndicators(sp, st, markets);
  const aggregatedIndicators = indicators[0]?.source === "openskin";

  const rows = [
    {
      market: "Skinport",
      price: sp?.min ?? null,
      fee: FEES.skinport,
      url: sp?.url,
      ts: sp?.min != null ? sp.updatedAt * 1000 : null,
      timeLabel: "Atualização da fonte",
      extra: sp ? `${sp.quantity} anúncios` : null,
    },
    {
      market: "Steam Market",
      price: st?.lowest ?? null,
      fee: FEES.steam,
      url: st?.url,
      ts: st?.lowest != null ? (data.steamFetchedAt as number | null) : null,
      timeLabel: "Consulta direta",
      extra: st?.volume24h != null ? `${st.volume24h} vendas/24h` : null,
    },
  ];
  const hasDirect = rows.some((r) => r.price != null);
  const cheapest = directPriceComparisonBaseline(rows.map((r) => r.price));

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
      <Link to="/busca" className="text-xs text-muted-foreground hover:text-primary">
        ← Pesquisa
      </Link>
      <div className="mt-3 grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="panel flex aspect-square items-center justify-center bg-hero p-6">
          {image ? (
            <img
              src={image}
              alt={name}
              className="max-h-full max-w-full object-contain drop-shadow-2xl"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
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
              {CATEGORY_LABEL[sp.category]} {sp.exterior && `· ${sp.exterior}`}{" "}
              {sp.stattrak && "· StatTrak™"} {sp.souvenir && "· Souvenir"}
            </p>
          )}
          <p className="mt-5 text-xs text-muted-foreground">
            {aggregatedIndicators
              ? "Dados agregados via OpenSkin · USD"
              : "Consulta direta às fontes · USD"}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            {indicators.map((i, index) => (
              <Box key={`${i.market}-${i.metric}`} label={indicatorLabel(i)}>
                <Money
                  v={i.value}
                  className={index === 0 ? "text-xl font-bold text-primary" : "text-xl font-bold"}
                />
                {i.source === "direct" &&
                  i.market === "Steam" &&
                  data.steamFetchedAt != null &&
                  st?.lowest != null && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Consulta direta · <Updated ts={data.steamFetchedAt} />
                    </div>
                  )}
                {i.source === "openskin" && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {data.openskin.status === "stale" && (
                      <span className="text-warning">Dados em cache · desatualizados · </span>
                    )}
                    {i.updatedAt ? (
                      <Updated ts={Date.parse(i.updatedAt)} />
                    ) : (
                      "Atualização não informada"
                    )}
                  </div>
                )}
              </Box>
            ))}
          </div>
          {sp?.min != null && sp.suggested != null && (
            <p className="mt-3 text-sm">
              Menor anúncio está <Pct v={pctDiff(sp.min, sp.suggested)} /> em relação à referência
              da Skinport. Isso não garante oportunidade — confira float, adesivos e pattern no
              anúncio.
            </p>
          )}
        </div>
      </div>

      {!hasDirect && <div className="mt-8" />}
      {!hasDirect && (
        <OpenSkinSection
          o={openSkin}
          hiddenOldPrices={data.openskin.markets.length > 0 && markets.length === 0}
          notice={
            hasAlternatives ? (
              <SteamNotice
                status={data.steamStatus}
                fetchedAt={data.steamFetchedAt}
                retryAt={data.steamRetryAt}
                hasAlternatives={hasAlternatives}
              />
            ) : undefined
          }
        />
      )}
      {hasDirect ? (
        <section className="panel mt-8 overflow-x-auto p-5">
          <h2 className="text-xl font-bold">Comparador entre marketplaces</h2>
          <SkinportStaleNotice
            stale={data.skinportStale}
            ts={data.fetchedAt}
            source={data.source}
          />
          <SteamNotice
            status={data.steamStatus}
            fetchedAt={data.steamFetchedAt}
            retryAt={data.steamRetryAt}
            hasAlternatives={hasAlternatives}
          />
          <p className="mb-4 text-xs text-muted-foreground">
            Preços agregados em USD informados pelas próprias fontes (menor anúncio, não um anúncio
            individual). Taxas públicas de cada plataforma. A atualização da Skinport e a consulta
            direta à Steam usam horários diferentes.
            {cheapest == null &&
              " Comparação percentual indisponível: há menos de dois preços diretos válidos."}
          </p>
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-2">Marketplace</th>
                <th className="p-2 text-right">Anúncio</th>
                <th className="p-2 text-right">Custo de compra</th>
                <th className="p-2 text-right">Δ vs. mais barato</th>
                <th className="p-2 text-right">Líquido se revender</th>
                <th className="p-2">Saldo</th>
                <th className="p-2">Horário da cotação</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.market} className="border-b border-border/50 align-top">
                  <td className="p-2 font-semibold">
                    {r.market}
                    <div className="text-xs font-normal text-muted-foreground">{r.extra}</div>
                  </td>
                  <td className="p-2 text-right">
                    <Money v={r.price} />
                  </td>
                  <td className="p-2 text-right">
                    {r.price != null ? (
                      <Money v={effectiveBuyCost(r.price, r.fee)} className="text-primary" />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-2 text-right">
                    {r.price != null && cheapest != null ? (
                      <Pct v={pctDiff(r.price, cheapest)} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-2 text-right">
                    {r.price != null ? <Money v={netAfterSale(r.price, r.fee)} /> : "—"}
                    <div className="text-[10px] text-muted-foreground">
                      taxa {r.fee.sellerFeePct}%
                    </div>
                  </td>
                  <td className="p-2">
                    <span
                      className={`rounded-sm px-1.5 py-0.5 text-[10px] uppercase ${r.fee.cashOut ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}
                    >
                      {r.fee.cashOut ? "Sacável" : "Só carteira Steam"}
                    </span>
                  </td>
                  <td className="p-2">
                    {r.ts != null ? (
                      <>
                        <div className="text-[10px] text-muted-foreground">{r.timeLabel}</div>
                        <Updated ts={r.ts} />
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-2">
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Abrir <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
            {rows.map((r) => (
              <li key={r.market} className="flex gap-1">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                <b>{r.market}:</b> {r.fee.note}
              </li>
            ))}
            <li className="flex gap-1">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Custos de saque, IOF e tempo de trade-lock não estão incluídos.
            </li>
          </ul>
        </section>
      ) : (
        <section className="panel mt-6 p-4 text-xs text-muted-foreground">
          <SkinportStaleNotice
            stale={data.skinportStale}
            ts={data.fetchedAt}
            source={data.source}
          />
          {!hasAlternatives && (
            <SteamNotice
              status={data.steamStatus}
              fetchedAt={data.steamFetchedAt}
              retryAt={data.steamRetryAt}
            />
          )}
          Comparador com taxas indisponível: sem preços diretos da Skinport ou da Steam no momento.
        </section>
      )}

      {hasDirect && (
        <OpenSkinSection
          o={openSkin}
          hiddenOldPrices={data.openskin.markets.length > 0 && markets.length === 0}
        />
      )}

      <section className="panel mt-6 p-5">
        <h2 className="text-xl font-bold">Histórico de vendas (Skinport)</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Vendas efetivamente concluídas, agregadas por período. A Skinport não expõe série diária;
          não estimamos pontos intermediários.
        </p>
        {periods.length && periods.some(([, p]) => p.volume > 0) ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              {periods.map(([label, p]) => (
                <div key={label} className="rounded-sm border border-border p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {label}
                  </div>
                  <div className="num mt-1 text-lg font-bold">
                    {p.median != null ? usd.format(p.median) : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">mediana · {p.volume} vendas</div>
                  <div className="num mt-1 text-xs text-muted-foreground">
                    {p.min != null && p.max != null
                      ? `${usd.format(p.min)} – ${usd.format(p.max)}`
                      : "sem vendas"}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 h-56">
              <ResponsiveContainer>
                <BarChart
                  data={periods.map(([l, p]) => ({ l, mediana: p.median, media: p.avg })).reverse()}
                >
                  <XAxis dataKey="l" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip
                    formatter={(v: number) => usd.format(v)}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                    }}
                    cursor={{ fill: "var(--accent)" }}
                  />
                  <Bar dataKey="mediana" name="Mediana" fill="var(--chart-1)" />
                  <Bar dataKey="media" name="Média" fill="var(--chart-2)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {data.history
              ? "Sem vendas registradas suficientes para este item."
              : "Histórico indisponível: a Skinport não respondeu à consulta."}
          </p>
        )}
      </section>

      {data.variants.length > 0 && (
        <section className="panel mt-6 p-5">
          <h2 className="text-xl font-bold">Outras versões desta skin</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.variants.map((v) => (
              <Link
                key={v.name}
                to="/item/$name"
                params={{ name: v.name }}
                className="flex justify-between rounded-sm border border-border p-3 text-sm hover:border-primary"
              >
                <span>
                  {v.stattrak && "ST™ "}
                  {v.exterior ?? v.name}
                </span>
                <Money v={v.min} currency={v.currency} className="text-primary" />
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

function indicatorLabel(i: ItemIndicator) {
  const metric = {
    ask: "Menor anúncio",
    reference: "Referência",
    median24h: "Mediana Steam 24h",
    bid: "Maior oferta de compra",
    median: "Mediana agregada",
  }[i.metric];
  return i.metric === "median24h" ? metric : `${metric} ${i.market}`;
}

function SteamNotice({
  status,
  fetchedAt,
  retryAt,
  hasAlternatives = false,
}: {
  status: string;
  fetchedAt: number | null;
  retryAt: number | null;
  hasAlternatives?: boolean;
}) {
  const mode = steamNoticeMode(status, hasAlternatives);
  if (mode === "none") return null;
  if (mode === "info")
    return (
      <div role="status" className="mb-3 flex gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          A consulta direta à Steam está temporariamente indisponível. Preços agregados alternativos
          estão disponíveis via OpenSkin (USD).
        </span>
      </div>
    );
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
    <div
      role="status"
      className="mb-3 flex gap-2 rounded-sm border border-warning/40 bg-warning/10 p-2 text-xs text-warning"
    >
      <Info className="mt-0.5 h-3 w-3 shrink-0" />
      <span>
        {msg}
        {retry && status !== "not_found" ? ` Nova tentativa em ~${retry} min.` : ""}
      </span>
    </div>
  );
}

function OpenSkinSection({
  o,
  notice,
  hiddenOldPrices = false,
}: {
  o: {
    markets: {
      market: string;
      ask: number | null;
      bid: number | null;
      median: number | null;
      listings: number | null;
      volume24h: number | null;
      currency: string;
      updatedAt: string | null;
      url: string | null;
    }[];
    status: string;
    fetchedAt: number | null;
  };
  notice?: React.ReactNode;
  hiddenOldPrices?: boolean;
}) {
  const fmt = (v: number | null, c: string) =>
    v == null ? "—" : c === "USD" ? usd.format(v) : `${v.toFixed(2)} ${c}`;
  return (
    <section className="panel mt-6 overflow-x-auto p-5">
      <h2 className="text-xl font-bold">Outros marketplaces (via OpenSkin)</h2>
      {notice}
      <p className="mb-4 text-xs text-muted-foreground">
        Preços agregados em USD, como informados pela OpenSkin (menor anúncio e maior oferta de
        compra por marketplace, não anúncios individuais).
      </p>
      {o.status === "stale" && (
        <div
          role="status"
          className="mb-3 rounded-sm border border-warning/40 bg-warning/10 p-2 text-xs text-warning"
        >
          OpenSkin indisponível. Exibindo últimos dados obtidos
          {o.fetchedAt
            ? ` (${new Date(o.fetchedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})`
            : ""}
          , que podem estar desatualizados.
        </div>
      )}
      {o.markets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {hiddenOldPrices
            ? "A OpenSkin retornou cotações sem atualização válida nas últimas 24h. Nenhum preço antigo é exibido."
            : o.status === "not_found"
              ? "A OpenSkin não retornou preços para este item."
              : "OpenSkin indisponível no momento. Nenhum preço exibido."}
        </p>
      ) : (
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr className="border-b border-border">
              <th className="p-2">Marketplace</th>
              <th className="p-2 text-right">Menor anúncio</th>
              <th className="p-2 text-right">Maior oferta de compra</th>
              <th className="p-2 text-right">Mediana</th>
              <th className="p-2 text-right">Anúncios</th>
              <th className="p-2 text-right">Vendas 24h</th>
              <th className="p-2">Atualizado</th>
              <th className="p-2"></th>
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
                <td className="p-2">
                  {m.updatedAt ? (
                    <Updated ts={Date.parse(m.updatedAt)} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-2">
                  {m.url && (
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Abrir <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
