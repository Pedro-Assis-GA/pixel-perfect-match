import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/market/AppShell";

export const Route = createFileRoute("/fontes")({
  head: () => ({
    meta: [
      { title: "Fontes de dados e limitações — SkinScope" },
      { name: "description", content: "Quais marketplaces de skins CS2 estão integrados e quais limitações existem." },
      { property: "og:title", content: "Fontes de dados — SkinScope" },
      { property: "og:description", content: "Status das integrações com marketplaces de skins CS2." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Sources,
});

const SOURCES = [
  { name: "Skinport", status: "ativo", how: "API pública oficial (itens e histórico de vendas agregado). Cache de 5 min, conforme limite da API.", gives: "Menor/maior preço, referência, quantidade de anúncios, vendas de 24h/7d/30d/90d." },
  { name: "Steam Community Market", status: "ativo", how: "Endpoint público de cotação, consultado por item.", gives: "Menor preço, mediana e volume de 24h, imagem do item. Saldo não sacável." },
  { name: "CSFloat", status: "requer chave", how: "API oficial com chave gratuita do usuário.", gives: "Anúncios individuais com float, seed, adesivos e fase Doppler." },
  { name: "DMarket", status: "requer chave", how: "API oficial com par de chaves.", gives: "Anúncios e preços de mercado." },
  { name: "SkinsMonkey", status: "sem API pública", how: "Requer parceria/integração autorizada.", gives: "—" },
  { name: "Buff163", status: "sem acesso legítimo", how: "Sem API pública; não fazemos raspagem nem contornamos login.", gives: "—" },
];

function Sources() {
  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Fontes de dados</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Mostramos apenas preços vindos das fontes. Quando uma fonte não está integrada, nada é estimado no lugar dela.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {SOURCES.map((s) => (
          <div key={s.name} className="panel p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">{s.name}</h2>
              <span className={`rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-widest ${s.status === "ativo" ? "bg-success/15 text-success" : s.status === "requer chave" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>
                {s.status}
              </span>
            </div>
            <p className="mt-2 text-sm">{s.how}</p>
            <p className="mt-1 text-xs text-muted-foreground">Dados: {s.gives}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
