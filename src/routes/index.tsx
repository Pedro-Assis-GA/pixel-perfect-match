import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Box, Layers, Database, CircleDollarSign, Crosshair, ArrowUpRight } from "lucide-react";
import { AppShell } from "@/components/market/AppShell";
import { SkinCard, SkinportStaleNotice, Updated } from "@/components/market/bits";
import { getDashboard } from "@/lib/market/market.functions";
import { CATEGORY_LABEL, type Category } from "@/lib/market/parse";

const dashQ = queryOptions({
  queryKey: ["dashboard"],
  queryFn: () => getDashboard(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SkinScope — Mercado de skins CS2 em tempo real" },
      {
        name: "description",
        content:
          "Compare preços reais de skins do CS2 entre Skinport e Steam, com taxas, histórico e oportunidades.",
      },
      { property: "og:title", content: "SkinScope — Mercado de skins CS2" },
      {
        property: "og:description",
        content: "Preços reais, comparação de taxas e oportunidades no mercado de skins CS2.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashQ),
  component: Dashboard,
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="panel p-6 text-sm">
        Não foi possível carregar o mercado agora:{" "}
        {error instanceof Error ? error.message : String(error)}
      </div>
    </AppShell>
  ),
});

function Dashboard() {
  const { data } = useSuspenseQuery(dashQ);
  const chart = Object.entries(data.byCat)
    .map(([k, v]) => ({ cat: CATEGORY_LABEL[k as Category], listings: v.listings }))
    .sort((a, b) => b.listings - a.listings);

  return (
    <AppShell>
      <section className="dashboard-hero mb-8">
        <div className="hero-art" aria-hidden="true" />
        <div className="hero-copy">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Visão geral do mercado</p>
          <h1 className="mt-2 text-4xl font-bold md:text-5xl">Mercado de Skins CS2</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Preços, liquidez e oportunidades em um só lugar. Atualizado{" "}
            <Updated ts={data.fetchedAt} />.
          </p>
        </div>
        <div className="hero-stats mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            icon={<Box />}
            label="Itens com anúncio"
            v={data.totals.items.toLocaleString("pt-BR")}
          />
          <Stat
            icon={<Layers />}
            label={
              data.source === "openskin"
                ? "Anúncios Skinport (via OpenSkin)"
                : "Anúncios ativos (Skinport)"
            }
            v={data.totals.listings.toLocaleString("pt-BR")}
          />
          <Stat icon={<Database />} label="Fontes integradas" v="3" />
          <Stat icon={<CircleDollarSign />} label="Moeda" v={data.currency ?? "USD"} />
        </div>
      </section>
      <SkinportStaleNotice stale={data.stale} ts={data.fetchedAt} source={data.source} />

      <Section
        title="Possíveis oportunidades"
        sub="Menor anúncio 10–80% abaixo do preço de referência Skinport (ambos em USD), referência ≥ US$ 4 e ≥20 anúncios. Confira estado, float e taxas antes de agir."
      >
        {data.opportunities.length ? (
          <Grid rows={data.opportunities} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma oportunidade com dados suficientes no momento.
          </p>
        )}
      </Section>

      <section className="panel mb-10 p-5">
        <h2 className="text-xl font-bold">Oferta por categoria</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Total de anúncios na Skinport
          {data.source === "openskin" ? " (reportados pela OpenSkin)" : ""}, sem somar outros
          marketplaces
        </p>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={chart}>
              <XAxis dataKey="cat" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }}
                cursor={{ fill: "var(--accent)" }}
              />
              <Bar dataKey="listings" name="Anúncios" fill="var(--chart-1)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <Section
        title="Mais ofertados"
        sub="Itens com maior número de anúncios — maior liquidez provável."
      >
        <Grid rows={data.mostListed} />
      </Section>
      <Section
        title="Atualizados recentemente"
        sub="Itens com referência acima de US$ 10 com preços atualizados por último."
      >
        <Grid rows={data.recent} />
      </Section>
      <div className="text-center">
        <Link to="/busca" className="text-sm text-primary hover:underline">
          Ver todos os itens →
        </Link>
      </div>
    </AppShell>
  );
}

function Stat({ label, v, icon }: { label: string; v: string; icon: React.ReactNode }) {
  return (
    <div className="panel stat-card p-4">
      <span className="stat-icon">{icon}</span>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="num mt-1 text-2xl font-bold">{v}</div>
      </div>
    </div>
  );
}

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <div className="section-heading">
        <h2 className="text-xl font-bold">
          <Crosshair aria-hidden="true" />
          {title}
        </h2>
        <Link to="/busca" className="text-primary text-xs">
          Ver itens <ArrowUpRight size={15} />
        </Link>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">{sub}</p>
      {children}
    </section>
  );
}

function Grid({ rows }: { rows: Parameters<typeof SkinCard>[0]["r"][] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      {rows.map((r) => (
        <SkinCard key={r.name} r={r} />
      ))}
    </div>
  );
}
