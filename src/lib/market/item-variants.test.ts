import { describe, expect, it, vi } from "vitest";
import { createItemVariantsClient, itemFamilySearch, matchesVariantFamily } from "./item-variants";

const clock = Date.parse("2026-10-30T12:00:00.000Z");
const original = "AK-47 | Slate (Factory New)";
const other = "AK-47 | Slate (Minimal Wear)";
const stattrak = "StatTrak™ AK-47 | Slate (Field-Tested)";

describe("bounded item variants (Cloudflare)", () => {
  it("searches only the specific family and accepts real variants", () => {
    expect(itemFamilySearch(original)).toBe("AK-47 | Slate");
    expect(itemFamilySearch("Sticker | ENCE (Holo) | Stockholm 2021")).toBe(
      "Sticker | ENCE (Holo)",
    );
    expect(matchesVariantFamily(original, other)).toBe(true);
    expect(matchesVariantFamily(original, "AK-47 | Asiimov (Minimal Wear)")).toBe(false);
  });

  it("calls a filtered item search and a bounded batch; no bulk catalog request", async () => {
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/items?"))
        return new Response(
          JSON.stringify({
            total: 3,
            data: [{ name: original }, { name: other }, { name: stattrak }],
          }),
        );
      if (url.endsWith("/v1/prices/batch")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body)).items).toHaveLength(2);
        return new Response(
          JSON.stringify({
            data: {
              [other]: {
                skinport: {
                  ask: 24,
                  ask_volume: 35,
                  currency: "USD",
                  updated_at: new Date(clock).toISOString(),
                },
              },
              [stattrak]: {
                skinport: {
                  ask: 31,
                  ask_volume: 12,
                  currency: "USD",
                  updated_at: new Date(clock - 25 * 60 * 60_000).toISOString(),
                },
              },
            },
          }),
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const get = createItemVariantsClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => clock,
    });
    const a = await get(original);
    expect(a.status).toBe("ok");
    expect(a.variants.map((v) => v.name)).toEqual(expect.arrayContaining([other, stattrak]));
    expect(a.variants.find((v) => v.name === other)?.min).toBe(24);
    expect(a.variants.find((v) => v.name === stattrak)?.min).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await get(original)).variants).toEqual(a.variants); // cache reuse
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every(([input]) => !String(input).includes("/v1/prices/all"))).toBe(
      true,
    );
  });

  it("keeps real variant names but never invents prices if the batch fails", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) =>
      String(input).includes("/v1/items?")
        ? new Response(JSON.stringify({ data: [{ name: original }, { name: other }] }))
        : new Response("", { status: 503 }),
    );
    const get = createItemVariantsClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => clock,
    });
    const result = await get(original);
    expect(result.status).toBe("partial");
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0]?.name).toBe(other);
    expect(result.variants[0]?.min).toBeNull();
  });

  it("handles search failures without loading a bulk snapshot", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 503 }));
    const get = createItemVariantsClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => clock,
    });
    expect(await get(original)).toEqual({ variants: [], status: "unavailable" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
