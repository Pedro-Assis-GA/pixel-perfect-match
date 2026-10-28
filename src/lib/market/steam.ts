// Steam Community Market client with caching, image reuse and 429 backoff.
// Pure module (fetch + clock injectable) so it can be unit-tested without network.
import { parseUSD } from "./parse";

export interface SteamQuote {
  lowest: number | null;
  median: number | null;
  volume24h: number | null;
  url: string;
  image: string | null;
}

export type SteamStatus = "ok" | "stale" | "rate_limited" | "unavailable" | "not_found";

export interface SteamResult {
  quote: SteamQuote | null;
  status: SteamStatus;
  fetchedAt: number | null; // ms — when the returned price was actually obtained from Steam
  retryAt: number | null; // ms — earliest next attempt when blocked/failing
}

export const PRICE_TTL = 10 * 60 * 1000; // fresh window for a price
export const IMAGE_TTL = 24 * 60 * 60 * 1000; // icons are stable, reuse for a day
const NOT_FOUND_TTL = 30 * 60 * 1000;
const FAIL_BACKOFF = 60 * 1000; // per-item wait after a non-429 failure
const RL_BASE = 60 * 1000; // first global wait after a 429
const RL_MAX = 30 * 60 * 1000;

class RateLimited extends Error {
  constructor(public retryAfterMs: number | null) {
    super("Steam 429");
  }
}

export function createSteamClient(opts: { fetch?: typeof fetch; now?: () => number } = {}) {
  const f = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = opts.now ?? Date.now;

  const prices = new Map<string, { quote: SteamQuote | null; at: number }>();
  const images = new Map<string, { url: string; at: number }>();
  const failedUntil = new Map<string, number>();
  const inflight = new Map<string, Promise<SteamResult>>();
  let blockedUntil = 0; // global: Steam rate-limits per IP, not per item
  let strikes = 0;

  async function getJson(url: string) {
    const r = await f(url);
    if (r.status === 429) {
      const ra = Number(r.headers.get("retry-after"));
      throw new RateLimited(Number.isFinite(ra) && ra > 0 ? ra * 1000 : null);
    }
    if (!r.ok) throw new Error(`Steam ${r.status}`);
    return r.json();
  }

  function fromCache(name: string, status: SteamStatus, retryAt: number | null): SteamResult {
    const c = prices.get(name);
    if (c?.quote) return { quote: c.quote, status: "stale", fetchedAt: c.at, retryAt };
    return { quote: null, status, fetchedAt: null, retryAt };
  }

  async function load(name: string): Promise<SteamResult> {
    const url = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(name)}`;
    const enc = encodeURIComponent(name);
    const img = images.get(name);
    const needImage = !img || now() - img.at > IMAGE_TTL;
    try {
      const [ov, search] = await Promise.all([
        getJson(`https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=${enc}`),
        needImage
          ? getJson(`https://steamcommunity.com/market/search/render/?appid=730&norender=1&count=5&query=${enc}`).catch(
              (e) => (e instanceof RateLimited ? Promise.reject(e) : null),
            )
          : null,
      ]);
      strikes = 0;
      if (needImage) {
        const hit = (search?.results ?? []).find((r: { hash_name: string }) => r.hash_name === name);
        const icon = hit?.asset_description?.icon_url;
        if (icon) images.set(name, { url: `https://community.cloudflare.steamstatic.com/economy/image/${icon}/360fx360f`, at: now() });
      }
      const image = images.get(name)?.url ?? null;
      if (!ov?.success) {
        prices.set(name, { quote: null, at: now() });
        return { quote: image ? { lowest: null, median: null, volume24h: null, url, image } : null, status: "not_found", fetchedAt: now(), retryAt: null };
      }
      const quote: SteamQuote = {
        lowest: parseUSD(ov.lowest_price),
        median: parseUSD(ov.median_price),
        volume24h: ov.volume ? parseInt(String(ov.volume).replace(/\D/g, ""), 10) : null,
        url,
        image,
      };
      prices.set(name, { quote, at: now() });
      failedUntil.delete(name);
      return { quote, status: "ok", fetchedAt: now(), retryAt: null };
    } catch (e) {
      if (e instanceof RateLimited) {
        strikes++;
        const wait = e.retryAfterMs ?? Math.min(RL_BASE * 2 ** (strikes - 1), RL_MAX);
        blockedUntil = now() + wait;
        return fromCache(name, "rate_limited", blockedUntil);
      }
      const until = now() + FAIL_BACKOFF;
      failedUntil.set(name, until);
      return fromCache(name, "unavailable", until);
    }
  }

  return {
    async getQuote(name: string): Promise<SteamResult> {
      const c = prices.get(name);
      if (c) {
        const ttl = c.quote ? PRICE_TTL : NOT_FOUND_TTL;
        if (now() - c.at < ttl) {
          return c.quote
            ? { quote: c.quote, status: "ok", fetchedAt: c.at, retryAt: null }
            : { quote: null, status: "not_found", fetchedAt: c.at, retryAt: null };
        }
      }
      if (now() < blockedUntil) return fromCache(name, "rate_limited", blockedUntil);
      const fu = failedUntil.get(name);
      if (fu && now() < fu) return fromCache(name, "unavailable", fu);
      let p = inflight.get(name);
      if (!p) {
        p = load(name).finally(() => inflight.delete(name));
        inflight.set(name, p);
      }
      return p;
    },
  };
}
