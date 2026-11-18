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
export const SKINPORT_BLOCK_COOLDOWN = 5 * 60 * 1000; // Back off after HTTP 403 or 429.
export const SKINPORT_ERROR_COOLDOWN = 60 * 1000; // Shorter wait after network/other failures.
// Display rule: old entries may be marked stale after 1 hour in the UI, but prices
// older than 24 hours (or with missing/invalid dates) are not used by the catalog.
export const MAX_CATALOG_PRICE_AGE = 24 * 60 * 60 * 1000;
const ALLOWED_FUTURE_SKEW = 5 * 60 * 1000;

export function hasUsablePriceTimestamp(updatedAtSeconds: number, timeMs: number): boolean {
  if (!Number.isFinite(updatedAtSeconds) || updatedAtSeconds <= 0) return false;
  const age = timeMs - updatedAtSeconds * 1000;
  return age >= -ALLOWED_FUTURE_SKEW && age <= MAX_CATALOG_PRICE_AGE;
}

function usableRows(rows: SkinRow[], timeMs: number): SkinRow[] {
  return rows.filter((r) => r.currency === "USD" && hasUsablePriceTimestamp(r.updatedAt, timeMs));
}

interface CatalogSnapshot {
  at: number;
  rows: SkinRow[];
}

function discardExpiredCatalog(cache: CatalogSnapshot | null, timeMs: number) {
  return cache && timeMs - cache.at > MAX_CATALOG_PRICE_AGE ? null : cache;
}

function cacheRows(snapshot: CatalogSnapshot | null, timeMs: number): SkinRow[] {
  const cache = discardExpiredCatalog(snapshot, timeMs);
  if (!cache || cache.at > timeMs + ALLOWED_FUTURE_SKEW) return [];
  return usableRows(cache.rows, timeMs);
}

class SkinportHttpError extends Error {
  constructor(readonly status: number) {
    super(`Skinport respondeu ${status}`);
    this.name = "SkinportHttpError";
  }
}

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
  let cache: CatalogSnapshot | null = null; // rows always USD (requested currency)
  let inflight: Promise<SkinRow[]> | null = null;
  let retryAt = 0;
  let lastError: unknown = null;

  return async function getItems(): Promise<SkinportItems> {
    cache = discardExpiredCatalog(cache, now());
    const saved = cacheRows(cache, now());
    if (saved.length && cache && now() - cache.at < SKINPORT_TTL)
      return { rows: saved, fetchedAt: cache.at, stale: false };
    // A blocked source must not be queried again on every page visit.
    if (now() < retryAt) {
      if (saved.length && cache) return { rows: saved, fetchedAt: cache.at, stale: true };
      throw lastError ?? new Error("Skinport temporariamente indisponível");
    }
    if (!inflight) {
      inflight = (async () => {
        const res = await f(
          "https://api.skinport.com/v1/items?app_id=730&currency=USD&tradable=0",
          {
            headers: { "Accept-Encoding": "br", Accept: "application/json" },
          },
        );
        if (!res.ok) throw new SkinportHttpError(res.status);
        const data = (await res.json()) as SkinportItem[];
        const rows = data.map((d) => ({
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
          currency: "USD" as const,
        }));
        const valid = usableRows(rows, now());
        if (!valid.length)
          throw new Error("Skinport sem preços com atualização válida nas últimas 24h");
        return valid;
      })()
        .then((rows) => {
          cache = { at: now(), rows };
          retryAt = 0;
          lastError = null;
          return rows;
        })
        .catch((error: unknown) => {
          lastError = error;
          const limited =
            error instanceof SkinportHttpError && (error.status === 403 || error.status === 429);
          retryAt = now() + (limited ? SKINPORT_BLOCK_COOLDOWN : SKINPORT_ERROR_COOLDOWN);
          throw error;
        })
        .finally(() => {
          inflight = null;
        });
    }
    try {
      const rows = await inflight;
      return { rows, fetchedAt: cache!.at, stale: false };
    } catch (e) {
      cache = discardExpiredCatalog(cache, now());
      const savedAfterFailure = cacheRows(cache, now());
      if (savedAfterFailure.length && cache)
        return { rows: savedAfterFailure, fetchedAt: cache.at, stale: true }; // preserve original timestamp
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
    const sp = entry?.skinport as
      | {
          [k: string]: unknown;
          updated_at?: unknown;
          suggested_price?: unknown;
          ask?: unknown;
          median?: unknown;
          mean?: unknown;
          max_ask?: unknown;
          ask_volume?: unknown;
        }
      | undefined;
    if (!sp || typeof sp !== "object") continue;
    const ts = typeof sp.updated_at === "string" ? Date.parse(sp.updated_at) : NaN;
    out.push({
      name,
      ...parseMarketName(name),
      suggested: n(sp.suggested_price),
      min: n(sp.ask),
      median: n(sp.median),
      mean: n(sp.mean),
      max: n(sp.max_ask),
      quantity: n(sp.ask_volume) ?? 0,
      updatedAt: Number.isFinite(ts) ? Math.floor(ts / 1000) : 0,
      url: `https://skinport.com/market?search=${encodeURIComponent(name)}`,
      currency: "USD",
    });
  }
  return out;
}

export function createCatalog(opts: {
  skinport: () => Promise<SkinportItems>;
  fetch?: typeof fetch;
  now?: () => number;
}) {
  const f = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = opts.now ?? Date.now;
  let cache: CatalogSnapshot | null = null;
  let failedUntil = 0;
  let fallbackInflight: Promise<SkinRow[]> | null = null;
  return async function getItems(): Promise<SkinportItems> {
    // Release an expired fallback even when Skinport keeps serving the catalog.
    cache = discardExpiredCatalog(cache, now());
    try {
      const r = await opts.skinport();
      cache = discardExpiredCatalog(cache, now());
      // Never serve rows denominated in another currency as USD (e.g. an old BRL cache).
      const rows = usableRows(r.rows, now());
      if (now() - r.fetchedAt > MAX_CATALOG_PRICE_AGE || !rows.length)
        throw new Error("Skinport sem preços recentes em USD");
      return { ...r, rows, source: "skinport", currency: "USD" };
    } catch (e) {
      cache = discardExpiredCatalog(cache, now());
      const saved = cacheRows(cache, now());
      const fb = (rows: SkinRow[], stale: boolean): SkinportItems => ({
        rows,
        fetchedAt: cache!.at, // time of the successful OpenSkin fetch, not current time
        stale,
        source: "openskin",
        currency: "USD",
      });
      if (saved.length && cache && now() - cache.at < SKINPORT_TTL) return fb(saved, false);
      if (now() < failedUntil) {
        if (saved.length) return fb(saved, true);
        throw e;
      }
      if (!fallbackInflight) {
        fallbackInflight = (async () => {
          const r = await f("https://api.openskin.dev/v1/prices/all", {
            headers: { Accept: "application/json" },
          });
          if (!r.ok) throw new Error(`OpenSkin respondeu ${r.status}`);
          const rows = usableRows(parseOpenSkinCatalog(await r.json()), now());
          if (!rows.length)
            throw new Error("OpenSkin sem preços com atualização válida nas últimas 24h");
          cache = { at: now(), rows };
          failedUntil = 0;
          return rows;
        })()
          .catch((error: unknown) => {
            failedUntil = now() + 2 * 60 * 1000;
            throw error;
          })
          .finally(() => {
            fallbackInflight = null;
          });
      }
      try {
        await fallbackInflight;
        const current = cacheRows(cache, now());
        if (current.length) return fb(current, false);
        throw new Error("OpenSkin sem preços recentes disponíveis");
      } catch {
        cache = discardExpiredCatalog(cache, now());
        const stillUsable = cacheRows(cache, now());
        if (stillUsable.length) return fb(stillUsable, true);
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

import { createSkinportHistoryClient } from "./skinport-history";
import type { MarketDiagnostic } from "./http-policy";

// No item names, URLs, response bodies, credentials or user identifiers in logs.
function marketDiagnostic(event: MarketDiagnostic) {
  console.warn("market_request_failed", JSON.stringify(event));
}
export const getSkinportHistoryResult = createSkinportHistoryClient({
  onDiagnostic: marketDiagnostic,
});
// Preserve the existing adapter interface for other callers.
export async function getSkinportHistory(name: string): Promise<SkinportHistory | null> {
  return (await getSkinportHistoryResult(name)).history;
}

import { createSteamClient } from "./steam";
import { createOpenSkinClient } from "./openskin";
export type { SteamQuote, SteamResult, SteamStatus } from "./steam";

const steam = createSteamClient({ onDiagnostic: marketDiagnostic });
export const getOpenSkinPrices = createOpenSkinClient();
export const getSteamQuote = (name: string) => steam.getQuote(name);
