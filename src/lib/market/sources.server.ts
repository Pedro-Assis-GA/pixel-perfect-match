// Server-only marketplace adapters. Each normalizes into SkinRow / ItemDetail.
import { parseMarketName, type ParsedName } from "./parse";

export interface SkinRow extends ParsedName {
  name: string;
  suggested: number | null;
  min: number | null;
  median: number | null;
  mean: number | null;
  max: number | null;
  quantity: number;
  updatedAt: number; // unix seconds
  url: string;
  currency: "BRL" | "USD";
}

interface SkinportItem {
  market_hash_name: string;
  suggested_price: number | null;
  min_price: number | null;
  max_price: number | null;
  mean_price: number | null;
  median_price: number | null;
  quantity: number;
  updated_at: number;
  item_page: string;
  market_page: string;
}

export const SKINPORT_TTL = 5 * 60 * 1000; // Skinport caches this endpoint for 5 min and rate-limits to 8 req / 5 min.

export interface SkinportItems {
  rows: SkinRow[];
  fetchedAt: number; // ms — when these rows were actually obtained from Skinport
  stale: boolean; // true when the latest refresh failed and older cached rows are served
  source?: "skinport" | "openskin";
  currency?: "BRL" | "USD";
}

export function createSkinportClient(opts: { fetch?: typeof fetch; now?: () => number } = {}) {
  const f = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = opts.now ?? Date.now;
  let cache: { at: number; rows: SkinRow[] } | null = null;
  let inflight: Promise<SkinRow[]> | null = null;

  return async function getItems(): Promise<SkinportItems> {
    if (cache && now() - cache.at < SKINPORT_TTL) return { rows: cache.rows, fetchedAt: cache.at, stale: false };
    if (!inflight) {
      inflight = (async () => {
        const res = await f("https://api.skinport.com/v1/items?app_id=730&currency=BRL&tradable=0", {
          headers: { "Accept-Encoding": "br", Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`Skinport respondeu ${res.status}`);
        const data = (await res.json()) as SkinportItem[];
        return data.map((d) => ({
          name: d.market_hash_name,
          ...parseMarketName(d.market_hash_name),
          suggested: d.suggested_price,
          min: d.min_price,
          median: d.median_price,
          mean: d.mean_price,
          max: d.max_price,
          quantity: d.quantity,
          updatedAt: d.updated_at,
          url: d.market_page || d.item_page,
          currency: "BRL" as const,
        }));
      })()
        .then((rows) => {
          cache = { at: now(), rows };
          return rows;
        })
        .finally(() => {
          inflight = null;
        });
    }
    try {
      const rows = await inflight;
      return { rows, fetchedAt: cache!.at, stale: false };
    } catch (e) {
      if (cache) return { rows: cache.rows, fetchedAt: cache.at, stale: true }; // serve stale on failure, flagged
      throw e;
    }
  };
}

const skinportDirect = createSkinportClient();

// Fallback: OpenSkin /v1/prices/all (one bulk request, CDN max-age 300). Uses the "skinport"
// market block it reports, in USD as provided. Only used when Skinport fails with no cache.
export function parseOpenSkinCatalog(body: unknown): SkinRow[] {
  const data = (body as { data?: Record<string, { skinport?: unknown }> })?.data ?? {};
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const out: SkinRow[] = [];
  for (const [name, entry] of Object.entries(data)) {
    const sp = entry?.skinport as { [k: string]: unknown; updated_at?: unknown; suggested_price?: unknown; ask?: unknown; median?: unknown; mean?: unknown; max_ask?: unknown; ask_volume?: unknown } | undefined;
    if (!sp || typeof sp !== "object") continue;
    const ts = typeof sp.updated_at === "string" ? Date.parse(sp.updated_at) : NaN;
    out.push({
      name, ...parseMarketName(name),
      suggested: n(sp.suggested_price), min: n(sp.ask), median: n(sp.median), mean: n(sp.mean), max: n(sp.max_ask),
      quantity: n(sp.ask_volume) ?? 0,
      updatedAt: Number.isFinite(ts) ? Math.floor(ts / 1000) : 0,
      url: `https://skinport.com/market?search=${encodeURIComponent(name)}`,
      currency: "USD",
    });
  }
  return out;
}

export function createCatalog(opts: { skinport: () => Promise<SkinportItems>; fetch?: typeof fetch; now?: () => number }) {
  const f = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = opts.now ?? Date.now;
  let cache: { at: number; rows: SkinRow[] } | null = null;
  let failedUntil = 0;
  return async function getItems(): Promise<SkinportItems> {
    try {
      return { ...(await opts.skinport()), source: "skinport", currency: "BRL" };
    } catch (e) {
      const fb = (stale: boolean): SkinportItems => ({ rows: cache!.rows, fetchedAt: cache!.at, stale, source: "openskin", currency: "USD" });
      if (cache && now() - cache.at < SKINPORT_TTL) return fb(false);
      if (now() < failedUntil) { if (cache) return fb(true); throw e; }
      try {
        const r = await f("https://api.openskin.dev/v1/prices/all", { headers: { Accept: "application/json" } });
        if (!r.ok) throw new Error(`OpenSkin respondeu ${r.status}`);
        const rows = parseOpenSkinCatalog(await r.json());
        if (!rows.length) throw new Error("OpenSkin sem itens");
        cache = { at: now(), rows };
        return fb(false);
      } catch {
        failedUntil = now() + 2 * 60 * 1000;
        if (cache) return fb(true);
        throw e;
      }
    }
  };
}

export const getSkinportItems = createCatalog({ skinport: skinportDirect });

export interface PeriodStat {
  min: number | null;
  max: number | null;
  avg: number | null;
  median: number | null;
  volume: number;
}
export interface SkinportHistory {
  last_24_hours: PeriodStat;
  last_7_days: PeriodStat;
  last_30_days: PeriodStat;
  last_90_days: PeriodStat;
}

const histCache = new Map<string, { at: number; v: SkinportHistory | null }>();
export async function getSkinportHistory(name: string): Promise<SkinportHistory | null> {
  const c = histCache.get(name);
  if (c && Date.now() - c.at < SKINPORT_TTL) return c.v;
  const res = await fetch(
    `https://api.skinport.com/v1/sales/history?app_id=730&currency=BRL&market_hash_name=${encodeURIComponent(name)}`,
    { headers: { "Accept-Encoding": "br" } },
  );
  if (!res.ok) return c?.v ?? null;
  const arr = (await res.json()) as SkinportHistory[];
  const v = arr[0] ?? null;
  histCache.set(name, { at: Date.now(), v });
  return v;
}

import { createSteamClient } from "./steam";
import { createOpenSkinClient } from "./openskin";
export type { SteamQuote, SteamResult, SteamStatus } from "./steam";

const steam = createSteamClient();
export const getOpenSkinPrices = createOpenSkinClient();
export const getSteamQuote = (name: string) => steam.getQuote(name);
