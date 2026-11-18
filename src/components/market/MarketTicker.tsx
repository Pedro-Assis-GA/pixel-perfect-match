import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Pause, Play, TrendingUp } from "lucide-react";
import { useState } from "react";
import { getTickerPrice } from "@/lib/market/market.functions";
import { SkinImage } from "./SkinImage";
import { Money, Updated } from "./bits";

export function MarketTicker() {
  const [paused, setPaused] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const names = [
    "AK-47 | Redline (Field-Tested)",
    "AWP | Asiimov (Field-Tested)",
    "M4A4 | Howl (Factory New)",
    "★ Karambit | Fade (Factory New)",
    "AUG | Chameleon (Factory New)",
  ];
  const rows = names.map((name) => ({ name }));
  const { data, isFetching } = useQuery({
    queryKey: ["ticker-price", active],
    queryFn: () => getTickerPrice({ data: { name: active! } }),
    enabled: active != null,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return (
    <section className="market-ticker" aria-label="Faixa do mercado de skins">
      <div className="ticker-label">
        <TrendingUp aria-hidden="true" size={19} />
        <span>MERCADO CS2</span>
      </div>
      <div className="ticker-window">
        {rows.length ? (
          <div className={`ticker-track ${paused || active ? "is-paused" : ""}`}>
            {[0, 1].map((copy) => (
              <div className="ticker-group" key={copy} aria-hidden={copy === 1 ? true : undefined}>
                {rows.map((row) => (
                  <div
                    className={`ticker-entry ${active === row.name ? "is-open" : ""} ${dismissed === row.name ? "is-dismissed" : ""}`}
                    key={row.name}
                    onPointerEnter={() => {
                      setDismissed(null);
                      setActive(row.name);
                    }}
                    onPointerLeave={(event) => {
                      setDismissed(null);
                      if (event.pointerType === "mouse") setActive(null);
                    }}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) {
                        setActive(null);
                        setDismissed(null);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setActive(null);
                        setDismissed(row.name);
                      }
                    }}
                  >
                    <button
                      type="button"
                      onFocus={() => {
                        setDismissed(null);
                        setActive(row.name);
                      }}
                      aria-expanded={active === row.name}
                      aria-label={`Ver cotação de ${row.name}`}
                      onClick={() => {
                        setDismissed(null);
                        setActive(row.name);
                      }}
                      tabIndex={copy === 1 ? -1 : undefined}
                      className="ticker-link"
                    >
                      <SkinImage name={row.name} />
                      <span>{row.name}</span>
                    </button>
                    <div className="ticker-price">
                      <strong>{row.name}</strong>
                      <button
                        type="button"
                        className="ticker-close"
                        aria-label="Fechar cotação"
                        tabIndex={copy === 1 ? -1 : undefined}
                        onClick={() => {
                          setActive(null);
                          setDismissed(row.name);
                        }}
                      >
                        ×
                      </button>
                      {isFetching ? (
                        <span>Consultando cotação…</span>
                      ) : (
                        <Money v={active === row.name ? data?.min : null} />
                      )}
                      <span>
                        Skinport via OpenSkin
                        {data?.updatedAt && active === row.name ? (
                          <>
                            {" "}
                            · <Updated ts={Date.parse(data.updatedAt)} />
                          </>
                        ) : (
                          ""
                        )}
                      </span>
                      <Link
                        to="/item/$name"
                        params={{ name: row.name }}
                        tabIndex={copy === 1 ? -1 : undefined}
                      >
                        Ver item →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="ticker-placeholder">Sem itens na faixa</p>
        )}
      </div>
      <button
        type="button"
        className="ticker-control"
        onClick={() => setPaused(!paused)}
        aria-label={paused ? "Retomar faixa de mercado" : "Pausar faixa de mercado"}
      >
        {paused ? <Play size={15} /> : <Pause size={15} />}
      </button>
    </section>
  );
}
