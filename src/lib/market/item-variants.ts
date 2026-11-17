// Lightweight, bounded alternative to loading the entire Skinport/OpenSkin catalog
// just to find other versions of one skin. OpenSkin Pricing API v1 is public and keyless.
import { parseMarketName } from "./parse";

export interface ItemVariant {
  name: string;
  min: number | null; // Skinport ask *reported by OpenSkin*, never a direct Skinport quote
  quantity: number;
  exterior: ReturnType<typeof parseMarketName>["exterior"];
  stattrak: boolean;
  currency: "USD";
  updatedAt: string | null;
}

export interface ItemVariantsResult {
  variants: ItemVariant[];
  status: "ok" | "partial" | "unavailable";
}

const MAX_VARIANTS = 24;
const MAX_SEARCH_PAGES = 2;
const ITEMS_PER_PAGE = 100;
const MAX_CACHE_KEYS = 32;
const TTL = 5 * 60_000;
const FAILURE_TTL = 60_000;
const MAX_PRICE_AGE = 24 * 60 * 60_000;
const FUTURE_SKEW = 5 * 60_000;

interface ListedItem {
  name?: unknown;
}
interface ItemListBody {
  total?: unknown;
  data?: unknown;
}
interface MarketQuote {
  ask?: unknown;
  ask_volume?: unknown;
  currency?: unknown;
  updated_at?: unknown;
}
interface BatchEntry {
  skinport?: MarketQuote | null;
}
interface BatchBody {
  data?: Record<string, BatchEntry>;
  results?: Array<BatchEntry & { item?: unknown }>;
}

function validQuote(block: MarketQuote | null | undefined, now: number) {
  if (!block || (block.currency != null && block.currency !== "USD")) return null;
  const date = typeof block.updated_at === "string" ? Date.parse(block.updated_at) : NaN;
  const age = now - date;
  if (!Number.isFinite(date) || age < -FUTURE_SKEW || age > MAX_PRICE_AGE) return null;
  if (typeof block.ask !== "number" || !Number.isFinite(block.ask) || block.ask <= 0) return null;
  return {
    min: block.ask,
    quantity:
      typeof block.ask_volume === "number" &&
      Number.isFinite(block.ask_volume) &&
      block.ask_volume >= 0
        ? block.ask_volume
        : 0,
    updatedAt: block.updated_at as string,
  };
}

// Search a specific family instead of /v1/prices/all. For a sticker, the event
// suffix is intentionally dropped so other tournaments remain discoverable.
export function itemFamilySearch(name: string): string | null {
  const parsed = parseMarketName(name);
  if (!parsed.weapon || !parsed.skin) return null;
  if (name.startsWith("Sticker | ")) {
    const parts = name.split(" | ");
    if (parts.length >= 3) return parts.slice(0, 2).join(" | ");
  }
  return `${parsed.weapon} | ${parsed.skin}`;
}

export function matchesVariantFamily(current: string, candidate: string): boolean {
  if (current === candidate) return false;
  const a = parseMarketName(current);
  const b = parseMarketName(candidate);
  return Boolean(a.weapon && a.skin && a.weapon === b.weapon && a.skin === b.skin);
}

function readNames(body: ItemListBody): string[] {
  if (!Array.isArray(body?.data)) return [];
  return (body.data as ListedItem[])
    .map((v) => v?.name)
    .filter((name): name is string => typeof name === "string" && name.length <= 200);
}

function normalizeBatch(body: BatchBody): Record<string, BatchEntry> {
  if (body?.data && typeof body.data === "object" && !Array.isArray(body.data)) return body.data;
  const map: Record<string, BatchEntry> = {};
  if (Array.isArray(body?.results)) {
    for (const v of body.results) if (typeof v?.item === "string") map[v.item] = v;
  }
  return map;
}

export function createItemVariantsClient(opts: { fetch?: typeof fetch; now?: () => number } = {}) {
  const request = opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { at: number; result: ItemVariantsResult }>();
  const inflight = new Map<string, Promise<ItemVariantsResult>>();

  async function load(name: string): Promise<ItemVariantsResult> {
    const term = itemFamilySearch(name);
    if (!term) return { variants: [], status: "ok" };
    const names = new Set<string>();
    try {
      for (let page = 1; page <= MAX_SEARCH_PAGES; page++) {
        const params = new URLSearchParams({
          search: term,
          page: String(page),
          limit: String(ITEMS_PER_PAGE),
        });
        const res = await request(`https://api.openskin.dev/v1/items?${params}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`OpenSkin items: ${res.status}`);
        const body = (await res.json()) as ItemListBody;
        const pageNames = readNames(body);
        for (const candidate of pageNames) {
          if (matchesVariantFamily(name, candidate)) names.add(candidate);
        }
        if (names.size >= MAX_VARIANTS || pageNames.length < ITEMS_PER_PAGE) break;
        if (typeof body.total === "number" && body.total <= page * ITEMS_PER_PAGE) break;
      }
    } catch {
      return { variants: [], status: "unavailable" };
    }

    const selected = [...names].sort((a, b) => a.localeCompare(b)).slice(0, MAX_VARIANTS);
    if (selected.length === 0) return { variants: [], status: "ok" };
    let prices: Record<string, BatchEntry> = {};
    let status: ItemVariantsResult["status"] = "ok";
    try {
      const res = await request("https://api.openskin.dev/v1/prices/batch", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ items: selected }),
      });
      if (!res.ok) throw new Error(`OpenSkin batch: ${res.status}`);
      prices = normalizeBatch((await res.json()) as BatchBody);
    } catch {
      // Names are still real catalog results; missing or failed quotes show as unavailable.
      status = "partial";
    }

    const variants = selected.map((candidate): ItemVariant => {
      const parsed = parseMarketName(candidate);
      const quote = validQuote(prices[candidate]?.skinport, now());
      return {
        name: candidate,
        min: quote?.min ?? null,
        quantity: quote?.quantity ?? 0,
        exterior: parsed.exterior,
        stattrak: parsed.stattrak,
        currency: "USD",
        updatedAt: quote?.updatedAt ?? null,
      };
    });
    return { variants, status };
  }

  return async function getVariants(name: string): Promise<ItemVariantsResult> {
    const cached = cache.get(name);
    if (cached && now() - cached.at < (cached.result.status === "ok" ? TTL : FAILURE_TTL)) {
      // Maintain bounded LRU order so a busy Worker does not grow indefinitely.
      cache.delete(name);
      cache.set(name, cached);
      return cached.result;
    }
    let current = inflight.get(name);
    if (!current) {
      current = load(name)
        .then((result) => {
          cache.delete(name);
          cache.set(name, { at: now(), result });
          while (cache.size > MAX_CACHE_KEYS) cache.delete(cache.keys().next().value!);
          return result;
        })
        .finally(() => inflight.delete(name));
      inflight.set(name, current);
    }
    return current;
  };
}

export const getOpenSkinVariants = createItemVariantsClient();
