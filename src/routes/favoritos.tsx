import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/market/AppShell";
import { FavButton } from "@/components/market/bits";
import { useFavorites } from "@/lib/market/favorites";

export const Route = createFileRoute("/favoritos")({
  head: () => ({
    meta: [
      { title: "Favoritos — SkinScope" },
      { name: "description", content: "Sua lista de observação de skins do CS2." },
      { property: "og:title", content: "Favoritos — SkinScope" },
      { property: "og:description", content: "Lista de observação de skins do CS2." },
    ],
  }),
  component: Favs,
});

function Favs() {
  const { favs } = useFavorites();
  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Lista de observação</h1>
      <p className="mb-6 text-sm text-muted-foreground">Salva neste navegador. Contas e alertas de preço chegam na próxima etapa.</p>
      {favs.length === 0 ? (
        <div className="panel p-6 text-sm text-muted-foreground">
          Nenhum favorito ainda. Use a estrela em qualquer item da <Link to="/busca" className="text-primary">pesquisa</Link>.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {favs.map((n) => (
            <div key={n} className="panel flex items-center justify-between p-3">
              <Link to="/item/$name" params={{ name: n }} className="text-sm hover:text-primary">{n}</Link>
              <FavButton name={n} />
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
