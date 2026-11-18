import { parseUSD } from "./parse";
import { describe, expect, it, vi } from "vitest";
import { createSteamClient, PRICE_TTL } from "./steam";

const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
const ov = { success: true, lowest_price: "$10.50", median_price: "$11.00", volume: "1,234" };
const search = { results: [{ hash_name: "AK", asset_description: { icon_url: "abc" } }] };

function setup(handler: (url: string) => Response | Promise<Response>) {
  let t = 1_000_000;
  const fetch = vi.fn(async (u: RequestInfo | URL) => handler(String(u)));
  const c = createSteamClient({ fetch: fetch as unknown as typeof globalThis.fetch, now: () => t });
  return { c, fetch, tick: (ms: number) => (t += ms), now: () => t };
}

describe("steam client", () => {
  it.each([429, 503, "offline", "invalid-json"] as const)(
    "keeps a valid quote when optional image lookup fails with %s",
    async (failure) => {
      const { c, fetch, tick, now } = setup((url) => {
        if (url.includes("priceoverview")) return ok(ov);
        if (failure === "offline") throw new Error("offline");
        if (failure === "invalid-json") return new Response("invalid-json");
        return new Response(null, { status: failure, headers: { "retry-after": "120" } });
      });
      const first = await c.getQuote("AK");
      expect(first).toMatchObject({
        status: "ok",
        fetchedAt: now(),
        quote: { lowest: 10.5, median: 11, image: null },
      });
      const calls = fetch.mock.calls.length;
      expect(await c.getQuote("AK")).toEqual(first);
      if (failure === 429) {
        const blocked = await c.getQuote("OTHER");
        expect(blocked).toMatchObject({ status: "rate_limited", quote: null });
        expect(blocked.retryAt).toBe(now() + 120_000);
        expect(fetch).toHaveBeenCalledTimes(calls);
        tick(120_000);
        expect((await c.getQuote("OTHER")).status).toBe("ok");
        expect(fetch).toHaveBeenCalledTimes(calls + 2);
      }
    },
  );

  it("shares concurrent quote requests even when the image is rate limited", async () => {
    const { c, fetch } = setup((url) =>
      url.includes("priceoverview") ? ok(ov) : new Response(null, { status: 429 }),
    );
    const results = await Promise.all([c.getQuote("AK"), c.getQuote("AK"), c.getQuote("AK")]);
    expect(results.every((result) => result.status === "ok" && result.quote?.lowest === 10.5)).toBe(
      true,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retains the longest Retry-After when both endpoints are rate limited", async () => {
    const { c, fetch, tick, now } = setup(
      (url) =>
        new Response(null, {
          status: 429,
          headers: { "retry-after": url.includes("priceoverview") ? "180" : "60" },
        }),
    );
    await c.getQuote("AK");
    await Promise.resolve();
    expect((await c.getQuote("OTHER")).retryAt).toBe(now() + 180_000);
    tick(60_000);
    expect((await c.getQuote("OTHER")).status).toBe("rate_limited");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps the original quote timestamp while a long image cooldown outlasts price TTL", async () => {
    const { c, fetch, tick, now } = setup((url) =>
      url.includes("priceoverview")
        ? ok(ov)
        : new Response(null, { status: 429, headers: { "retry-after": "1200" } }),
    );
    const quote = await c.getQuote("AK");
    tick(PRICE_TTL + 1);
    const cached = await c.getQuote("AK");
    expect(cached).toMatchObject({
      status: "stale",
      fetchedAt: quote.fetchedAt,
      retryAt: now() + 1_200_000 - PRICE_TTL - 1,
      quote: { lowest: 10.5 },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not clear a newer cooldown when another in-flight quote succeeds", async () => {
    let finish!: (response: Response) => void;
    const delayed = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const { c, fetch, now } = setup((url) => {
      if (url.includes("market_hash_name=AK")) return delayed;
      if (url.includes("priceoverview")) return ok(ov);
      return url.includes("query=LIMIT")
        ? new Response(null, { status: 429, headers: { "retry-after": "180" } })
        : ok(search);
    });
    const pending = c.getQuote("AK");
    expect((await c.getQuote("LIMIT")).status).toBe("ok");
    finish(ok(ov));
    expect((await pending).status).toBe("ok");
    const count = fetch.mock.calls.length;
    expect(await c.getQuote("OTHER")).toMatchObject({
      status: "rate_limited",
      retryAt: now() + 180_000,
    });
    expect(fetch).toHaveBeenCalledTimes(count);
  });

  it("caches a successful quote and does not refetch within TTL", async () => {
    const { c, fetch } = setup((u) => ok(u.includes("priceoverview") ? ov : search));
    const a = await c.getQuote("AK");
    expect(a.status).toBe("ok");
    expect(a.quote?.lowest).toBe(10.5);
    expect(a.quote?.image).toContain("abc");
    await c.getQuote("AK");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reuses the cached image on refresh (skips the search call)", async () => {
    const { c, fetch, tick } = setup((u) => ok(u.includes("priceoverview") ? ov : search));
    await c.getQuote("AK");
    tick(PRICE_TTL + 1);
    const b = await c.getQuote("AK");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(b.quote?.image).toContain("abc");
  });

  it("on 429 serves stale cache flagged as stale with original timestamp, then stops calling", async () => {
    let limited = false;
    const { c, fetch, tick } = setup((u) =>
      limited ? new Response("", { status: 429 }) : ok(u.includes("priceoverview") ? ov : search),
    );
    const first = await c.getQuote("AK");
    tick(PRICE_TTL + 1);
    limited = true;
    const r = await c.getQuote("AK");
    expect(r.status).toBe("stale");
    expect(r.fetchedAt).toBe(first.fetchedAt);
    expect(r.retryAt).not.toBeNull();
    const calls = fetch.mock.calls.length;
    const other = await c.getQuote("M4");
    expect(other.status).toBe("rate_limited");
    expect(other.quote).toBeNull();
    expect(fetch.mock.calls.length).toBe(calls);
  });

  it("honors Retry-After and resumes after it", async () => {
    let limited = true;
    const { c, tick } = setup((u) =>
      limited
        ? new Response("", { status: 429, headers: { "retry-after": "120" } })
        : ok(u.includes("priceoverview") ? ov : search),
    );
    expect((await c.getQuote("AK")).status).toBe("rate_limited");
    limited = false;
    tick(60_000);
    expect((await c.getQuote("AK")).status).toBe("rate_limited");
    tick(61_000);
    expect((await c.getQuote("AK")).status).toBe("ok");
  });

  it("network failure returns unavailable without throwing and backs off", async () => {
    const { c, fetch } = setup(() => {
      throw new Error("offline");
    });
    const r = await c.getQuote("AK");
    expect(r).toMatchObject({ status: "unavailable", quote: null, fetchedAt: null });
    const n = fetch.mock.calls.length;
    await c.getQuote("AK");
    expect(fetch.mock.calls.length).toBe(n);
  });

  it("item without Steam price is not_found, no invented price", async () => {
    const { c } = setup(() => ok({ success: false }));
    const r = await c.getQuote("X");
    expect(r.status).toBe("not_found");
    expect(r.quote).toBeNull();
  });
});

describe("steam USD", () => {
  it("parses Steam USD strings (currency=1)", () => {
    expect(parseUSD("$1,163.55")).toBe(1163.55);
    expect(parseUSD("$0.03 USD")).toBe(0.03);
  });
});
