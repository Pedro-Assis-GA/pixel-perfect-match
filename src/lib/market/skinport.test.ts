import { describe, expect, it, vi } from "vitest";
import { createSkinportClient, SKINPORT_TTL } from "./sources.server";

const item = { market_hash_name: "AK-47 | Redline (Field-Tested)", suggested_price: 160, min_price: 115, max_price: 300, mean_price: 150, median_price: 140, quantity: 63, updated_at: 1, item_page: "", market_page: "https://skinport.com/x" };

function setup(handler: () => Response | Promise<Response>) {
  let t = 1_000_000;
  const fetch = vi.fn(async () => handler());
  const get = createSkinportClient({ fetch: fetch as unknown as typeof globalThis.fetch, now: () => t });
  return { get, fetch, tick: (ms: number) => (t += ms) };
}

describe("skinport client", () => {
  it("success returns fresh rows and caches them within TTL", async () => {
    const { get, fetch } = setup(() => new Response(JSON.stringify([item])));
    const a = await get();
    expect(a.stale).toBe(false);
    expect(a.rows[0]).toMatchObject({ min: 115, quantity: 63, category: "Rifle" });
    await get();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("failure with previous cache serves old rows flagged stale with original timestamp", async () => {
    let fail = false;
    const { get, tick } = setup(() => (fail ? new Response("", { status: 503 }) : new Response(JSON.stringify([item]))));
    const first = await get();
    tick(SKINPORT_TTL + 1);
    fail = true;
    const r = await get();
    expect(r.stale).toBe(true);
    expect(r.fetchedAt).toBe(first.fetchedAt);
    expect(r.rows[0]!.min).toBe(115);
  });

  it("network error with previous cache is also flagged stale", async () => {
    let fail = false;
    const { get, tick } = setup(() => {
      if (fail) throw new Error("offline");
      return new Response(JSON.stringify([item]));
    });
    await get();
    tick(SKINPORT_TTL + 1);
    fail = true;
    expect((await get()).stale).toBe(true);
  });

  it("failure with no cache throws (no invented rows)", async () => {
    const { get } = setup(() => new Response("", { status: 429 }));
    await expect(get()).rejects.toThrow("Skinport respondeu 429");
  });

  it("recovers to fresh data after the source is back", async () => {
    let fail = false;
    const { get, tick } = setup(() => (fail ? new Response("", { status: 500 }) : new Response(JSON.stringify([item]))));
    await get();
    tick(SKINPORT_TTL + 1);
    fail = true;
    await get();
    fail = false;
    expect((await get()).stale).toBe(false);
  });
});
