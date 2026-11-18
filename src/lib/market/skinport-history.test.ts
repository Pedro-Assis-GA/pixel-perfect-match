import { describe, expect, it, vi } from "vitest";
import { createSkinportHistoryClient, HISTORY_TTL, MAX_HISTORY_AGE } from "./skinport-history";
import { retryAfterMs } from "./http-policy";

const period = { min: 10, max: 12, avg: 11, median: 11, volume: 3 };
const history = {
  last_24_hours: period,
  last_7_days: period,
  last_30_days: period,
  last_90_days: period,
};
const ok = (body: unknown = [history]) => new Response(JSON.stringify(body));

function setup(handler: () => Response | Promise<Response>) {
  let time = Date.UTC(2026, 10, 18, 12);
  const fetcher = vi.fn(handler);
  const diagnostic = vi.fn();
  const read = createSkinportHistoryClient({
    fetch: fetcher as typeof fetch,
    now: () => time,
    onDiagnostic: diagnostic,
  });
  return {
    read,
    fetcher,
    diagnostic,
    now: () => time,
    tick: (ms: number) => {
      time += ms;
    },
  };
}

describe("history cache, fallback and recovery", () => {
  it("deduplicates concurrent reads, caches warm reads and refreshes at TTL", async () => {
    let resolve!: (r: Response) => void;
    const pending = new Promise<Response>((r) => {
      resolve = r;
    });
    let cold = true;
    const s = setup(() => (cold ? pending : ok()));
    const a = s.read("A");
    const b = s.read("A");
    expect(s.fetcher).toHaveBeenCalledTimes(1);
    resolve(ok());
    cold = false;
    expect(await a).toEqual(await b);
    await s.read("A");
    expect(s.fetcher).toHaveBeenCalledTimes(1);
    s.tick(HISTORY_TTL);
    await s.read("A");
    expect(s.fetcher).toHaveBeenCalledTimes(2);
  });

  it("preserves original timestamp during 403 fallback, blocks other items and recovers", async () => {
    let blocked = false;
    const s = setup(() => (blocked ? new Response(null, { status: 403 }) : ok()));
    const first = await s.read("A");
    s.tick(HISTORY_TTL);
    blocked = true;
    expect(await s.read("A")).toMatchObject({
      history,
      status: "stale",
      fetchedAt: first.fetchedAt,
    });
    expect(await s.read("B")).toMatchObject({ history: null, status: "unavailable" });
    expect(s.fetcher).toHaveBeenCalledTimes(2);
    s.tick(HISTORY_TTL);
    blocked = false;
    expect(await s.read("A")).toMatchObject({ status: "ok", fetchedAt: s.now() });
  });

  it("honors HTTP-date Retry-After after 429 without shortening the global wait", async () => {
    const s = setup(
      () =>
        new Response(null, {
          status: 429,
          headers: { "Retry-After": new Date(s.now() + 3600_000).toUTCString() },
        }),
    );
    const a = await s.read("A");
    expect(a.retryAt).toBe(s.now() + 3600_000);
    s.tick(HISTORY_TTL);
    expect(await s.read("B")).toMatchObject({ status: "rate_limited", retryAt: a.retryAt });
    expect(s.fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not serve data older than 24 hours after a failure", async () => {
    let blocked = false;
    const s = setup(() => (blocked ? new Response(null, { status: 503 }) : ok()));
    await s.read("A");
    s.tick(MAX_HISTORY_AGE + 1);
    blocked = true;
    expect(await s.read("A")).toMatchObject({
      history: null,
      fetchedAt: null,
      status: "unavailable",
    });
  });

  it.each(["network", "json", "shape"])(
    "backs off after %s failure without inventing sales",
    async (mode) => {
      const s = setup(() => {
        if (mode === "network") throw new Error("secret payload");
        return mode === "json" ? new Response("invalid") : ok([{ last_24_hours: { volume: -1 } }]);
      });
      expect(await s.read("PRIVATE-ITEM-NAME")).toMatchObject({
        history: null,
        status: "unavailable",
        fetchedAt: null,
      });
      await s.read("PRIVATE-ITEM-NAME");
      expect(s.fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(s.diagnostic.mock.calls)).not.toMatch(/PRIVATE|secret payload/);
      s.tick(60_000);
      await s.read("PRIVATE-ITEM-NAME");
      expect(s.fetcher).toHaveBeenCalledTimes(2);
    },
  );

  it("keeps empty history separate from a valid zero-sales response", async () => {
    let empty = true;
    const zero = Object.fromEntries(
      Object.keys(history).map((key) => [
        key,
        { min: null, max: null, avg: null, median: null, volume: 0 },
      ]),
    );
    const s = setup(() => ok(empty ? [] : [zero]));
    expect(await s.read("A")).toMatchObject({ history: null, status: "not_found" });
    empty = false;
    s.tick(HISTORY_TTL);
    expect(await s.read("A")).toMatchObject({ history: zero, status: "ok" });
  });

  it("bounds snapshots to 64 keys", async () => {
    const s = setup(() => ok());
    for (let i = 0; i < 65; i++) await s.read(String(i));
    await s.read("0");
    expect(s.fetcher).toHaveBeenCalledTimes(66);
  });
});

describe("Retry-After", () => {
  it("accepts seconds and future dates but rejects invalid/past values", () => {
    const now = Date.UTC(2026, 10, 18, 12);
    expect(retryAfterMs("120", now)).toBe(120_000);
    expect(retryAfterMs(new Date(now + 120_000).toUTCString(), now)).toBe(120_000);
    for (const value of [null, "", "nonsense", "-1", "0", new Date(now - 1000).toUTCString()])
      expect(retryAfterMs(value, now)).toBeNull();
  });
});
