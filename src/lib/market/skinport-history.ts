import type { SkinportHistory, PeriodStat } from "./sources.server";
import { emitDiagnostic, retryAfterMs, type MarketDiagnostic } from "./http-policy";

export const HISTORY_TTL = 5 * 60_000;
export const MAX_HISTORY_AGE = 24 * 3600_000;
const MAX_KEYS = 64;
export interface HistoryResult {
  history: SkinportHistory | null;
  status: "ok" | "stale" | "not_found" | "rate_limited" | "unavailable";
  fetchedAt: number | null;
  retryAt: number | null;
}

function validPeriod(value: unknown): value is PeriodStat {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    ["min", "max", "avg", "median"].every(
      (key) =>
        p[key] === null || (typeof p[key] === "number" && Number.isFinite(p[key]) && p[key] >= 0),
    ) &&
    typeof p["volume"] === "number" &&
    Number.isInteger(p["volume"]) &&
    p["volume"] >= 0
  );
}
function validHistory(value: unknown): value is SkinportHistory {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return ["last_24_hours", "last_7_days", "last_30_days", "last_90_days"].every((key) =>
    validPeriod(p[key]),
  );
}

export function createSkinportHistoryClient(
  opts: {
    fetch?: typeof fetch;
    now?: () => number;
    onDiagnostic?: (event: MarketDiagnostic) => void;
  } = {},
) {
  const fetcher = opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { history: SkinportHistory | null; at: number }>();
  const failures = new Map<string, number>();
  const inflight = new Map<string, Promise<HistoryResult>>();
  let blockedUntil = 0;
  let blockedStatus: "rate_limited" | "unavailable" = "unavailable";
  function prune() {
    for (const [key, value] of cache)
      if (now() - value.at > MAX_HISTORY_AGE || value.at > now()) cache.delete(key);
    for (const [key, until] of failures) if (until <= now()) failures.delete(key);
  }
  function bound<T>(map: Map<string, T>) {
    while (map.size > MAX_KEYS) map.delete(map.keys().next().value!);
  }
  function fallback(
    name: string,
    status: "rate_limited" | "unavailable",
    retryAt: number,
  ): HistoryResult {
    prune();
    const c = cache.get(name);
    return c?.history
      ? { history: c.history, status: "stale", fetchedAt: c.at, retryAt }
      : { history: null, status, fetchedAt: null, retryAt };
  }
  async function load(name: string): Promise<HistoryResult> {
    let status: number | null = null;
    try {
      const response = await fetcher(
        `https://api.skinport.com/v1/sales/history?app_id=730&currency=USD&market_hash_name=${encodeURIComponent(name)}`,
        { headers: { "Accept-Encoding": "br", Accept: "application/json" } },
      );
      status = response.status;
      if (!response.ok) {
        emitDiagnostic(opts.onDiagnostic, {
          source: "skinport_history",
          endpoint: "sales_history",
          status,
          failure: "http",
        });
        if (status === 403 || status === 429) {
          const until =
            now() +
            Math.max(HISTORY_TTL, retryAfterMs(response.headers.get("retry-after"), now()) ?? 0);
          if (until >= blockedUntil) {
            blockedUntil = until;
            blockedStatus = status === 429 ? "rate_limited" : "unavailable";
          }
          return fallback(name, status === 429 ? "rate_limited" : "unavailable", blockedUntil);
        }
        const until = now() + 60_000;
        failures.set(name, until);
        bound(failures);
        return fallback(name, "unavailable", until);
      }
      const body: unknown = await response.json();
      if (!Array.isArray(body) || (body.length > 0 && !validHistory(body[0])))
        throw new Error("Invalid history payload");
      const history: SkinportHistory | null = body.length ? body[0] : null;
      const at = now();
      cache.delete(name);
      cache.set(name, { history, at });
      bound(cache);
      failures.delete(name);
      return { history, status: history ? "ok" : "not_found", fetchedAt: at, retryAt: null };
    } catch {
      emitDiagnostic(opts.onDiagnostic, {
        source: "skinport_history",
        endpoint: "sales_history",
        status,
        failure: status === null ? "network" : "invalid_data",
      });
      const until = now() + 60_000;
      failures.set(name, until);
      bound(failures);
      return fallback(name, "unavailable", until);
    }
  }
  return async function getHistory(name: string): Promise<HistoryResult> {
    prune();
    const c = cache.get(name);
    if (c && now() - c.at < HISTORY_TTL)
      return {
        history: c.history,
        status: c.history ? "ok" : "not_found",
        fetchedAt: c.at,
        retryAt: null,
      };
    const waiting = inflight.get(name);
    if (waiting) return waiting;
    if (blockedUntil > now()) return fallback(name, blockedStatus, blockedUntil);
    const until = failures.get(name);
    if (until && until > now()) return fallback(name, "unavailable", until);
    const request = load(name).finally(() => inflight.delete(name));
    inflight.set(name, request);
    return request;
  };
}
