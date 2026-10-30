// OpenSkin free public v1 Pricing API (no key). Pure module: fetch + clock injectable for tests.
// Prices are returned as provided (USD); no conversion is done here.

export interface OpenSkinMarket {
  market: string;
  ask: number | null; // lowest current listing
  bid: number | null; // highest current buy order
  median: number | null;
  listings: number | null;
  volume24h: number | null;
  currency: string;
  updatedAt: string | null; // ISO, as reported by OpenSkin
  url: string | null;
}

export type OpenSkinStatus = "ok" | "stale" | "unavailable" | "not_found";

export interface OpenSkinResult {
  markets: OpenSkinMarket[];
  status: OpenSkinStatus;
  icon?: string | null; // item image URL reported by OpenSkin
  fetchedAt: number | null;
  retryAt: number | null;
}

export const OPENSKIN_TTL = 5 * 60 * 1000; // matches their CDN max-age=300
export const MAX_OPENSKIN_CACHE_AGE = 24 * 60 * 60 * 1000;
const FAIL_BACKOFF = 2 * 60 * 1000;
const LABEL: Record<string, string> = {
  steam: "Steam",
  skinport: "Skinport",
  buff: "Buff163",
  youpin: "YouPin",
  csfloat: "CSFloat",
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseOpenSkin(body: unknown): OpenSkinMarket[] {
  const b = body as {
    prices?: Record<
      string,
      {
        ask?: unknown;
        bid?: unknown;
        highest_bid?: unknown;
        median?: unknown;
        ask_volume?: unknown;
        sell_order_count?: unknown;
        volume_24h?: unknown;
        currency?: unknown;
        updated_at?: unknown;
      } | null
    >;
    links?: Record<string, string>;
  };
  return Object.entries(b?.prices ?? {})
    .filter(([, p]) => p && typeof p === "object")
    .map(([k, p]) => ({
      market: LABEL[k] ?? k,
      ask: num(p!.ask),
      bid: num(p!.bid) ?? num(p!.highest_bid),
      median: num(p!.median),
      listings: num(p!.ask_volume) ?? num(p!.sell_order_count),
      volume24h: num(p!.volume_24h),
      currency: typeof p!.currency === "string" ? p!.currency : "USD",
      updatedAt: typeof p!.updated_at === "string" ? p!.updated_at : null,
      url: b.links?.[k] ?? null,
    }))
    .filter((m) => m.ask != null || m.bid != null || m.median != null);
}

export function createOpenSkinClient(opts: { fetch?: typeof fetch; now?: () => number } = {}) {
  const f = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { markets: OpenSkinMarket[]; at: number; icon?: string | null }>();
  const failedUntil = new Map<string, number>();

  const fallback = (name: string, retryAt: number): OpenSkinResult => {
    const c = cache.get(name);
    const age = c ? now() - c.at : Infinity;
    return c?.markets.length && age >= 0 && age <= MAX_OPENSKIN_CACHE_AGE
      ? { markets: c.markets, icon: c.icon ?? null, status: "stale", fetchedAt: c.at, retryAt }
      : { markets: [], icon: c?.icon ?? null, status: "unavailable", fetchedAt: null, retryAt };
  };

  return async function getPrices(name: string): Promise<OpenSkinResult> {
    const c = cache.get(name);
    if (c && now() - c.at < OPENSKIN_TTL)
      return {
        markets: c.markets,
        icon: c.icon ?? null,
        status: c.markets.length ? "ok" : "not_found",
        fetchedAt: c.at,
        retryAt: null,
      };
    const fu = failedUntil.get(name);
    if (fu && now() < fu) return fallback(name, fu);
    try {
      const r = await f(`https://api.openskin.dev/v1/prices?item=${encodeURIComponent(name)}`, {
        headers: { Accept: "application/json" },
      });
      if (r.status === 404) {
        cache.set(name, { markets: [], at: now() });
        return { markets: [], status: "not_found", fetchedAt: now(), retryAt: null };
      }
      if (!r.ok) throw new Error(`OpenSkin ${r.status}`);
      const body = (await r.json()) as { icon_url?: unknown };
      const markets = parseOpenSkin(body);
      const icon =
        typeof body?.icon_url === "string" && body.icon_url.startsWith("https://")
          ? body.icon_url
          : null;
      cache.set(name, { markets, at: now(), icon });
      failedUntil.delete(name);
      return {
        markets,
        icon,
        status: markets.length ? "ok" : "not_found",
        fetchedAt: now(),
        retryAt: null,
      };
    } catch {
      const ra = now() + FAIL_BACKOFF;
      failedUntil.set(name, ra);
      return fallback(name, ra);
    }
  };
}
