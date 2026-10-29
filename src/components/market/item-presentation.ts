import type { OpenSkinMarket } from "@/lib/market/openskin";

export interface ItemIndicator {
  market: string;
  metric: "ask" | "reference" | "median24h" | "bid" | "median";
  value: number | null;
  source: "direct" | "openskin";
  updatedAt?: string | null;
}

const valid = (value: number | null | undefined): value is number =>
  value != null && Number.isFinite(value) && value >= 0;

export function hasAggregatePrices(markets: OpenSkinMarket[]) {
  return markets.some((m) => m.currency === "USD" && [m.ask, m.bid, m.median].some(valid));
}

export function itemIndicators(
  skinport: { min: number | null; suggested?: number | null } | null,
  steam: { lowest: number | null; median: number | null } | null,
  markets: OpenSkinMarket[],
): ItemIndicator[] {
  const direct: ItemIndicator[] = [
    { market: "Skinport", metric: "ask", value: skinport?.min ?? null, source: "direct" },
    { market: "Skinport", metric: "reference", value: skinport?.suggested ?? null, source: "direct" },
    { market: "Steam", metric: "ask", value: steam?.lowest ?? null, source: "direct" },
    { market: "Steam", metric: "median24h", value: steam?.median ?? null, source: "direct" },
  ];
  if (direct.some((i) => valid(i.value))) return direct;

  const aggregated: ItemIndicator[] = markets
    .filter((m) => m.currency === "USD")
    .flatMap((m): ItemIndicator[] => {
      const metric = valid(m.ask) ? "ask" : valid(m.bid) ? "bid" : valid(m.median) ? "median" : null;
      return metric ? [{ market: m.market, metric, value: m[metric], source: "openskin", updatedAt: m.updatedAt }] : [];
    })
    .slice(0, 4);
  return aggregated.length ? aggregated : direct;
}

export function steamNoticeMode(status: string, hasAlternatives: boolean) {
  if (status === "ok") return "none";
  if (hasAlternatives && status !== "stale") return "info";
  return "warning";
}