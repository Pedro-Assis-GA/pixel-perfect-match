import { describe, expect, it, vi } from "vitest";
import {
  directPriceComparisonBaseline,
  usableDirectPrice,
  usableOpenSkinMarkets,
  usablePriceTime,
} from "../../components/market/item-presentation";
import { createSteamClient } from "./steam";
import { createOpenSkinClient, type OpenSkinMarket } from "./openskin";

const time = Date.parse("2026-10-30T12:00:00.000Z");
const market = (updatedAt: string | null, currency = "USD"): OpenSkinMarket => ({
  market: "Skinport",
  ask: 20,
  bid: null,
  median: null,
  listings: 15,
  volume24h: null,
  currency,
  updatedAt,
  url: null,
});

describe("individual price safety", () => {
  it("accepts a fresh Steam quote, but not an expired direct quote", () => {
    expect(usableDirectPrice(10, time - 30 * 60_000, time)).toBe(10);
    expect(usableDirectPrice(10, time - 25 * 60 * 60_000, time)).toBeNull();
    expect(usableDirectPrice(10, null, time)).toBeNull();
  });

  it("does not trust missing timestamps or prices from the future", () => {
    expect(usablePriceTime(null, time)).toBe(false);
    expect(usablePriceTime(NaN, time)).toBe(false);
    expect(usablePriceTime(time + 10 * 60_000, time)).toBe(false);
  });

  it("keeps OpenSkin markets whose actual price update is within 24h", () => {
    const entries = [
      market(new Date(time - 30 * 60_000).toISOString()),
      market(new Date(time - 2 * 60 * 60_000).toISOString()),
    ];
    expect(usableOpenSkinMarkets(entries, time, time)).toHaveLength(2);
  });

  it("rejects outdated, missing-time, future, and wrong-currency OpenSkin prices", () => {
    const entries = [
      market(new Date(time - 25 * 60 * 60_000).toISOString()),
      market(null),
      market("not a date"),
      market(new Date(time + 10 * 60_000).toISOString()),
      market(new Date(time).toISOString(), "BRL"),
    ];
    expect(usableOpenSkinMarkets(entries, time, time)).toEqual([]);
  });

  it("rejects markets when the OpenSkin response itself is older than 24h", () => {
    expect(
      usableOpenSkinMarkets([market(new Date(time).toISOString())], time - 25 * 60 * 60_000, time),
    ).toEqual([]);
  });

  it("avoids the misleading 0% comparison when only one source has a direct price", () => {
    expect(directPriceComparisonBaseline([null, 1.3])).toBeNull();
    expect(directPriceComparisonBaseline([0, 1.3])).toBeNull();
    expect(directPriceComparisonBaseline([0.85, 1.3])).toBe(0.85);
  });

  it("does not reuse a Steam quote older than 24h after a 429", async () => {
    let clock = time;
    let blocked = false;
    const fetch = vi.fn(async (input: string | URL | Request) => {
      if (blocked) return new Response("", { status: 429 });
      if (String(input).includes("priceoverview")) {
        return new Response(
          JSON.stringify({
            success: true,
            lowest_price: "$1.30",
            median_price: "$1.35",
            volume: "20",
          }),
        );
      }
      return new Response(
        JSON.stringify({
          results: [
            { hash_name: "Danger Zone Case", asset_description: { icon_url: "sample-icon" } },
          ],
        }),
      );
    });
    const get = createSteamClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => clock,
    });
    const first = await get.getQuote("Danger Zone Case");
    expect(first.status).toBe("ok");
    expect(first.quote?.lowest).toBe(1.3);
    clock += 25 * 60 * 60_000;
    blocked = true;
    const expired = await get.getQuote("Danger Zone Case");
    expect(expired.status).toBe("rate_limited");
    expect(expired.quote?.lowest ?? null).toBeNull();
    expect(expired.quote?.image).toContain("sample-icon");
  });

  it("does not reuse OpenSkin cache older than 24h after failure", async () => {
    let clock = time;
    let offline = false;
    const fetch = vi.fn(async () =>
      offline
        ? new Response("", { status: 503 })
        : new Response(
            JSON.stringify({
              prices: {
                skinport: { ask: 20, currency: "USD", updated_at: new Date(clock).toISOString() },
              },
            }),
          ),
    );
    const get = createOpenSkinClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => clock,
    });
    expect((await get("Danger Zone Case")).markets).toHaveLength(1);
    clock += 25 * 60 * 60_000;
    offline = true;
    const expired = await get("Danger Zone Case");
    expect(expired.status).toBe("unavailable");
    expect(expired.markets).toHaveLength(0);
  });
});
