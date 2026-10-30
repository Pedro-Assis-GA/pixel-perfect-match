import { describe, expect, it, vi } from "vitest";
import {
  createSkinportClient,
  SKINPORT_TTL,
  SKINPORT_BLOCK_COOLDOWN,
  SKINPORT_ERROR_COOLDOWN,
  MAX_CATALOG_PRICE_AGE,
  hasUsablePriceTimestamp,
} from "./sources.server";

const item = {
  market_hash_name: "AK-47 | Redline (Field-Tested)",
  suggested_price: 160,
  min_price: 115,
  max_price: 300,
  mean_price: 150,
  median_price: 140,
  quantity: 63,
  updated_at: 1,
  item_page: "",
  market_page: "https://skinport.com/x",
};

function setup(handler: () => Response | Promise<Response>) {
  let t = 1_000_000;
  const fetch = vi.fn(async () => handler());
  const get = createSkinportClient({
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => t,
  });
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
    const { get, tick } = setup(() =>
      fail ? new Response("", { status: 503 }) : new Response(JSON.stringify([item])),
    );
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

  it("does not repeat 403 requests during cooldown without a cache", async () => {
    let blocked = true;
    const { get, fetch, tick } = setup(() =>
      blocked ? new Response("", { status: 403 }) : new Response(JSON.stringify([item])),
    );
    await expect(get()).rejects.toThrow("Skinport respondeu 403");
    await expect(get()).rejects.toThrow("Skinport respondeu 403");
    expect(fetch).toHaveBeenCalledTimes(1);
    blocked = false;
    tick(SKINPORT_BLOCK_COOLDOWN - 1);
    await expect(get()).rejects.toThrow("Skinport respondeu 403");
    expect(fetch).toHaveBeenCalledTimes(1);
    tick(1);
    expect((await get()).stale).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps original cached timestamp and avoids repeated requests after 429", async () => {
    let blocked = false;
    const { get, fetch, tick } = setup(() =>
      blocked ? new Response("", { status: 429 }) : new Response(JSON.stringify([item])),
    );
    const first = await get();
    tick(SKINPORT_TTL + 1);
    blocked = true;
    const stale = await get();
    expect(stale.stale).toBe(true);
    expect(stale.fetchedAt).toBe(first.fetchedAt);
    await get();
    expect(fetch).toHaveBeenCalledTimes(2);
    blocked = false;
    tick(SKINPORT_BLOCK_COOLDOWN);
    expect((await get()).stale).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("recovers to fresh data after the source is back", async () => {
    let fail = false;
    const { get, tick } = setup(() =>
      fail ? new Response("", { status: 500 }) : new Response(JSON.stringify([item])),
    );
    await get();
    tick(SKINPORT_TTL + 1);
    fail = true;
    await get();
    fail = false;
    tick(SKINPORT_ERROR_COOLDOWN);
    expect((await get()).stale).toBe(false);
  });
});

import { createCatalog } from "./sources.server";
describe("catalog fallback", () => {
  const CATALOG_NOW = Date.parse("2026-10-27T21:05:00Z");
  const body = {
    data: {
      "AK-47 | Redline (Field-Tested)": {
        skinport: {
          ask: 30.5,
          ask_volume: 40,
          suggested_price: 33,
          updated_at: "2026-10-27T21:00:00Z",
        },
      },
      "No Skinport": { steam: { ask: 1 } },
    },
  };
  it("Skinport 403 with empty cache serves real OpenSkin rows in USD", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(body)));
    const get = createCatalog({
      skinport: async () => {
        throw new Error("Skinport respondeu 403");
      },
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => CATALOG_NOW,
    });
    const r = await get();
    expect(r.source).toBe("openskin");
    expect(r.currency).toBe("USD");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ min: 30.5, quantity: 40, currency: "USD" });
    await get();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("deduplicates simultaneous fallback requests when Skinport is blocked", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(body)));
    const get = createCatalog({
      skinport: async () => {
        throw new Error("Skinport respondeu 403");
      },
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => CATALOG_NOW,
    });
    const results = await Promise.all([get(), get(), get()]);
    expect(results.every((r) => r.source === "openskin" && !r.stale)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("both sources down with no cache throws", async () => {
    const get = createCatalog({
      skinport: async () => {
        throw new Error("Skinport respondeu 403");
      },
      fetch: (async () => new Response("", { status: 503 })) as unknown as typeof globalThis.fetch,
      now: () => CATALOG_NOW,
    });
    await expect(get()).rejects.toThrow("403");
  });
  const row = (currency: "USD" | "BRL", updatedAt = CATALOG_NOW / 1000) =>
    ({
      name: "X",
      currency,
      min: 1,
      quantity: 1,
      updatedAt,
    }) as unknown as import("./sources.server").SkinRow;
  it("Skinport working stays the source in USD", async () => {
    const get = createCatalog({
      skinport: async () => ({ rows: [row("USD")], fetchedAt: CATALOG_NOW, stale: false }),
      now: () => CATALOG_NOW,
    });
    expect(await get()).toMatchObject({ source: "skinport", currency: "USD" });
  });
  it("an old BRL cache is never served as USD; falls back to OpenSkin", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    const get = createCatalog({
      skinport: async () => ({ rows: [row("BRL")], fetchedAt: 1, stale: true }),
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => CATALOG_NOW,
    });
    const r = await get();
    expect(r.source).toBe("openskin");
    expect(r.rows.every((x) => x.currency === "USD")).toBe(true);
  });
  it("direct Skinport requests USD", async () => {
    const { get, fetch } = setup(() => new Response(JSON.stringify([item]), { status: 200 }));
    const r = await get();
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toContain("currency=USD");
    expect(r.rows[0]?.currency).toBe("USD");
  });
});

describe("limites de idade das cotações do catálogo", () => {
  const t = Date.parse("2026-10-29T12:00:00Z");
  const stamp = (ageMs: number) => Math.floor((t - ageMs) / 1000);
  const row = (name: string, ageMs: number, currency: "USD" | "BRL" = "USD") =>
    ({
      name,
      currency,
      min: 10,
      quantity: 1,
      updatedAt: stamp(ageMs),
    }) as unknown as import("./sources.server").SkinRow;
  const body = (entries: Record<string, unknown>) => ({ data: entries });
  const market = (ageMs: number) => ({
    skinport: { ask: 20, ask_volume: 10, updated_at: new Date(t - ageMs).toISOString() },
  });

  it("aceita preço recente, avisa via UI após 1h e exclui acima de 24h", () => {
    expect(hasUsablePriceTimestamp(stamp(59 * 60_000), t)).toBe(true);
    expect(hasUsablePriceTimestamp(stamp(2 * 60 * 60_000), t)).toBe(true); // UI marca 'desatualizado'
    expect(hasUsablePriceTimestamp(stamp(MAX_CATALOG_PRICE_AGE - 1000), t)).toBe(true);
    expect(hasUsablePriceTimestamp(stamp(MAX_CATALOG_PRICE_AGE + 1000), t)).toBe(false);
    expect(hasUsablePriceTimestamp(0, t)).toBe(false);
    expect(hasUsablePriceTimestamp(Number.NaN, t)).toBe(false);
    expect(hasUsablePriceTimestamp(Math.floor((t + 10 * 60_000) / 1000), t)).toBe(false);
  });

  it("Skinport: remove linhas antigas da resposta antes de exibir preços", async () => {
    const fresh = { ...item, updated_at: stamp(10 * 60_000) };
    const old = {
      ...item,
      market_hash_name: "AWP | Asiimov (Field-Tested)",
      updated_at: stamp(MAX_CATALOG_PRICE_AGE + 60_000),
    };
    const fetch = vi.fn(async () => new Response(JSON.stringify([fresh, old])));
    const get = createSkinportClient({
      now: () => t,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    const result = await get();
    expect(result.rows.map((r) => r.name)).toEqual([fresh.market_hash_name]);
  });

  it("Skinport: não reutiliza cache vencido após falha, nem durante cooldown", async () => {
    let clock = t;
    let blocked = false;
    const fetch = vi.fn(async () =>
      blocked
        ? new Response("", { status: 403 })
        : new Response(JSON.stringify([{ ...item, updated_at: stamp(10 * 60_000) }])),
    );
    const get = createSkinportClient({
      now: () => clock,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    await get();
    blocked = true;
    clock += MAX_CATALOG_PRICE_AGE + 1;
    await expect(get()).rejects.toThrow("Skinport respondeu 403");
    await expect(get()).rejects.toThrow("Skinport respondeu 403");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("OpenSkin: mantém só preços com timestamps válidos e dentro do limite", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            body({
              "AK-47 | Redline (Field-Tested)": market(5 * 60_000),
              "AK-47 | Slate (Factory New)": market(2 * 60 * 60_000),
              "AK-47 | Elite Build (Field-Tested)": market(MAX_CATALOG_PRICE_AGE + 60_000),
              "AWP | Asiimov (Battle-Scarred)": { skinport: { ask: 42, ask_volume: 5 } },
              "M4A4 | Desolate Space (Field-Tested)": market(-10 * 60_000),
            }),
          ),
        ),
    );
    const get = createCatalog({
      skinport: async () => {
        throw new Error("Skinport respondeu 403");
      },
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => t,
    });
    const result = await get();
    expect(result.source).toBe("openskin");
    expect(result.rows.map((r) => r.name)).toEqual([
      "AK-47 | Redline (Field-Tested)",
      "AK-47 | Slate (Factory New)",
    ]);
  });

  it("OpenSkin: se somente existem cotações antigas, não inventa preços", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            body({
              "AK-47 | Redline (Field-Tested)": market(MAX_CATALOG_PRICE_AGE + 60_000),
            }),
          ),
        ),
    );
    const get = createCatalog({
      skinport: async () => {
        throw new Error("Skinport respondeu 403");
      },
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => t,
    });
    await expect(get()).rejects.toThrow("Skinport respondeu 403");
  });

  it("OpenSkin: cache antigo não reaparece após uma falha na atualização", async () => {
    let clock = t;
    let fail = false;
    const fetch = vi.fn(async () =>
      fail
        ? new Response("", { status: 503 })
        : new Response(JSON.stringify(body({ "AK-47 | Redline (Field-Tested)": market(60_000) }))),
    );
    const get = createCatalog({
      skinport: async () => {
        throw new Error("Skinport respondeu 403");
      },
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => clock,
    });
    await get();
    clock += MAX_CATALOG_PRICE_AGE + 1;
    fail = true;
    await expect(get()).rejects.toThrow("Skinport respondeu 403");
    await expect(get()).rejects.toThrow("Skinport respondeu 403"); // cooldown; no old cache
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("Skinport agregadora: recusa snapshot vencido mesmo com horário individual recente", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            body({
              "AK-47 | Redline (Field-Tested)": market(60_000),
            }),
          ),
        ),
    );
    const get = createCatalog({
      skinport: async () => ({
        rows: [row("X", 60_000)],
        fetchedAt: t - MAX_CATALOG_PRICE_AGE - 60_000,
        stale: true,
      }),
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => t,
    });
    expect((await get()).source).toBe("openskin");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
