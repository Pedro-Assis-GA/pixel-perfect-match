import { createFileRoute, Link } from "@tanstack/react-router";
import { Star, Search } from "lucide-react";
import { SkinImage } from "@/components/market/SkinImage";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Favs,
});

function Favs() {
  const { favs } = useFavorites();
  return (
    <AppShell>
      <div className="page-heading">
        <Star aria-hidden="true" />
        <h1 className="text-3xl font-bold">Favoritos</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Acompanhe seus itens preferidos. Sua lista fica salva neste navegador.
      </p>
      {favs.length === 0 ? (
        <div className="panel favorites-empty">
          <Star className="empty-star" aria-hidden="true" />
          <h2>Nenhum favorito ainda</h2>
          <p>Use a estrela em qualquer item da pesquisa para adicioná-lo aqui.</p>
          <Link to="/busca" className="explore-button">
            <Search size={19} />
            Explorar skins
          </Link>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {favs.map((n) => (
            <div key={n} className="panel favorite-row flex items-center justify-between p-3">
              <Link
                to="/item/$name"
                params={{ name: n }}
                className="flex items-center gap-4 text-sm hover:text-primary"
              >
                <SkinImage name={n} />
                {n}
              </Link>
              <FavButton name={n} />
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
