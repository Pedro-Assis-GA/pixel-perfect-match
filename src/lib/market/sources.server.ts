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

let cache: { at: number; rows: SkinRow[] } | null = null;
let inflight: Promise<SkinRow[]> | null = null;
const TTL = 5 * 60 * 1000; // Skinport caches this endpoint for 5 min and rate-limits to 8 req / 5 min.

export async function getSkinportItems(): Promise<{ rows: SkinRow[]; fetchedAt: number }> {
  if (cache && Date.now() - cache.at < TTL) return { rows: cache.rows, fetchedAt: cache.at };
  if (!inflight) {
    inflight = (async () => {
      const res = await fetch("https://api.skinport.com/v1/items?app_id=730&currency=BRL&tradable=0", {
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
      }));
    })()
      .then((rows) => {
        cache = { at: Date.now(), rows };
        return rows;
      })
      .finally(() => {
        inflight = null;
      });
  }
  try {
    const rows = await inflight;
    return { rows, fetchedAt: cache!.at };
  } catch (e) {
    if (cache) return { rows: cache.rows, fetchedAt: cache.at }; // serve stale on failure
    throw e;
  }
}

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
  if (c && Date.now() - c.at < TTL) return c.v;
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
export type { SteamQuote, SteamResult, SteamStatus } from "./steam";

const steam = createSteamClient();
export const getSteamQuote = (name: string) => steam.getQuote(name);
