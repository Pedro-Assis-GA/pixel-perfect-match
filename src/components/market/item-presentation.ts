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

// The catalog and item page use the same 24-hour upper bound for price age.
// A recent API fetch is NOT evidence that each marketplace updated its prices.
export const MAX_ITEM_PRICE_AGE = 24 * 60 * 60 * 1000;
export const ITEM_PRICE_WARNING_AGE = 60 * 60 * 1000;
const ALLOWED_FUTURE_SKEW = 5 * 60 * 1000;

export function usablePriceTime(timeMs: number | null | undefined, nowMs = Date.now()): boolean {
  if (timeMs == null || !Number.isFinite(timeMs) || timeMs <= 0) return false;
  const age = nowMs - timeMs;
  return age >= -ALLOWED_FUTURE_SKEW && age <= MAX_ITEM_PRICE_AGE;
}

export function usableDirectPrice(
  price: number | null | undefined,
  fetchedAt: number | null | undefined,
  nowMs = Date.now(),
): number | null {
  return valid(price) && price > 0 && usablePriceTime(fetchedAt, nowMs) ? price : null;
}

export function usableOpenSkinMarkets(
  markets: OpenSkinMarket[],
  fetchedAt: number | null,
  nowMs = Date.now(),
): OpenSkinMarket[] {
  // Check both the cache age and the actual per-market timestamp from OpenSkin.
  if (!usablePriceTime(fetchedAt, nowMs)) return [];
  return markets.filter(
    (market) =>
      market.currency === "USD" &&
      market.updatedAt != null &&
      usablePriceTime(Date.parse(market.updatedAt), nowMs),
  );
}

export function directPriceComparisonBaseline(prices: (number | null)[]): number | null {
  const comparable = prices.filter((price): price is number => valid(price) && price > 0);
  // With only one source, 0% would be mathematically true but misleading.
  return comparable.length >= 2 ? Math.min(...comparable) : null;
}

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
    {
      market: "Skinport",
      metric: "reference",
      value: skinport?.suggested ?? null,
      source: "direct",
    },
    { market: "Steam", metric: "ask", value: steam?.lowest ?? null, source: "direct" },
    { market: "Steam", metric: "median24h", value: steam?.median ?? null, source: "direct" },
  ];
  if (direct.some((i) => valid(i.value))) return direct;

  const aggregated: ItemIndicator[] = markets
    .filter((m) => m.currency === "USD")
    .flatMap((m): ItemIndicator[] => {
      const metric = valid(m.ask)
        ? "ask"
        : valid(m.bid)
          ? "bid"
          : valid(m.median)
            ? "median"
            : null;
      return metric
        ? [
            {
              market: m.market,
              metric,
              value: m[metric],
              source: "openskin",
              updatedAt: m.updatedAt,
            },
          ]
        : [];
    })
    .slice(0, 4);
  return aggregated.length ? aggregated : direct;
}

export function steamNoticeMode(status: string, hasAlternatives: boolean) {
  if (status === "ok") return "none";
  if (hasAlternatives && status !== "stale") return "info";
  return "warning";
}
