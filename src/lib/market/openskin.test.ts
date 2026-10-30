import { describe, expect, it, vi } from "vitest";
import { createOpenSkinClient, OPENSKIN_TTL, parseOpenSkin } from "./openskin";

const body = {
  prices: {
    steam: {
      bid: 31.25,
      ask: 31.6,
      median: 31.92,
      volume_24h: 62,
      sell_order_count: 1276,
      currency: "USD",
      updated_at: "2026-10-27T15:29:11Z",
    },
    csfloat: {
      ask: 23.9,
      sell_order_count: 3727,
      highest_bid: 23.6,
      currency: "USD",
      updated_at: "2026-10-27T16:01:46Z",
    },
    youpin: { ask: null, bid: null, currency: "USD" },
  },
  links: { steam: "https://steamcommunity.com/x" },
};

function setup(h: () => Response) {
  let t = 1_000_000;
  const fetch = vi.fn(async () => h());
  return {
    get: createOpenSkinClient({ fetch: fetch as unknown as typeof globalThis.fetch, now: () => t }),
    fetch,
    tick: (ms: number) => (t += ms),
  };
}

describe("openskin", () => {
  it("maps ask as lowest listing and bid/highest_bid as highest buy order; drops markets with no prices", () => {
    const m = parseOpenSkin(body);
    expect(m.map((x) => x.market)).toEqual(["Steam", "CSFloat"]);
    expect(m[0]).toMatchObject({
      ask: 31.6,
      bid: 31.25,
      listings: 1276,
      volume24h: 62,
      currency: "USD",
      url: "https://steamcommunity.com/x",
    });
    expect(m[1]).toMatchObject({ ask: 23.9, bid: 23.6, median: null, url: null });
  });
  it("caches within TTL", async () => {
    const { get, fetch } = setup(() => new Response(JSON.stringify(body)));
    expect((await get("AK")).status).toBe("ok");
    await get("AK");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("failure after success serves stale with original time; failure without cache is unavailable with no prices", async () => {
    let fail = false;
    const { get, tick } = setup(() =>
      fail ? new Response("", { status: 503 }) : new Response(JSON.stringify(body)),
    );
    const a = await get("AK");
    tick(OPENSKIN_TTL + 1);
    fail = true;
    const b = await get("AK");
    expect(b).toMatchObject({ status: "stale", fetchedAt: a.fetchedAt });
    const c = await get("M4");
    expect(c).toMatchObject({ status: "unavailable", markets: [], fetchedAt: null });
  });
  it("404 is not_found", async () => {
    const { get } = setup(() => new Response("", { status: 404 }));
    expect((await get("X")).status).toBe("not_found");
  });
});
