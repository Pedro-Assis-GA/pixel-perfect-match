import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/market/AppShell";
import { SkinCard, Updated } from "@/components/market/bits";
import { getDashboard } from "@/lib/market/market.functions";
import { CATEGORY_LABEL, type Category } from "@/lib/market/parse";

const dashQ = queryOptions({ queryKey: ["dashboard"], queryFn: () => getDashboard(), staleTime: 60_000 });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SkinScope — Mercado de skins CS2 em tempo real" },
      { name: "description", content: "Compare preços reais de skins do CS2 entre Skinport e Steam, com taxas, histórico e oportunidades." },
      { property: "og:title", content: "SkinScope — Mercado de skins CS2" },
      { property: "og:description", content: "Preços reais, comparação de taxas e oportunidades no mercado de skins CS2." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashQ),
  component: Dashboard,
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="panel p-6 text-sm">Não foi possível carregar o mercado agora: {error instanceof Error ? error.message : String(error)}</div>
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
      <section className="mb-10">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Visão geral do mercado</p>
        <h1 className="mt-2 text-4xl font-bold md:text-5xl">Mercado CS2, sem achismo.</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Preços reais coletados das fontes, taxas explícitas e oportunidades filtradas por liquidez. Atualizado{" "}
          <Updated ts={data.fetchedAt} />.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Itens com anúncio" v={data.totals.items.toLocaleString("pt-BR")} />
          <Stat label="Anúncios ativos (Skinport)" v={data.totals.listings.toLocaleString("pt-BR")} />
          <Stat label="Fontes integradas" v="2" />
          <Stat label="Moeda" v="BRL" />
        </div>
      </section>

      <Section title="Possíveis oportunidades" sub="Menor anúncio ≥10% abaixo do preço de referência Skinport, com ≥20 anúncios. Confira estado, float e taxas antes de agir.">
        {data.opportunities.length ? (
          <Grid rows={data.opportunities} />
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma oportunidade com dados suficientes no momento.</p>
        )}
      </Section>

      <section className="panel mb-10 p-5">
        <h2 className="text-xl font-bold">Oferta por categoria</h2>
        <p className="mb-4 text-xs text-muted-foreground">Total de anúncios ativos na Skinport</p>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={chart}>
              <XAxis dataKey="cat" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }} cursor={{ fill: "var(--accent)" }} />
              <Bar dataKey="listings" name="Anúncios" fill="var(--chart-1)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <Section title="Mais ofertados" sub="Itens com maior número de anúncios — maior liquidez provável.">
        <Grid rows={data.mostListed} />
      </Section>
      <Section title="Atualizados recentemente" sub="Itens acima de R$ 50 com preços atualizados por último.">
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

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="panel p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="num mt-1 text-2xl font-bold">{v}</div>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mb-4 text-xs text-muted-foreground">{sub}</p>
      {children}
    </section>
  );
}

function Grid({ rows }: { rows: Parameters<typeof SkinCard>[0]["r"][] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map((r) => (
        <SkinCard key={r.name} r={r} />
      ))}
    </div>
  );
}
