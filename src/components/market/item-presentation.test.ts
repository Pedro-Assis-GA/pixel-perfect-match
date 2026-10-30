import { describe, expect, it } from "vitest";
import type { OpenSkinMarket } from "@/lib/market/openskin";
import { hasAggregatePrices, itemIndicators, steamNoticeMode } from "./item-presentation";

const market = (overrides: Partial<OpenSkinMarket> = {}): OpenSkinMarket => ({
  market: "Steam",
  ask: 31.6,
  bid: 31.25,
  median: 31.92,
  listings: 1276,
  volume24h: 62,
  currency: "USD",
  updatedAt: "2026-10-27T15:29:11Z",
  url: null,
  ...overrides,
});

describe("item presentation data selection", () => {
  it("preserves direct indicators when Steam is unavailable but Skinport responds", () => {
    const result = itemIndicators({ min: 23.9, suggested: 30 }, null, [market()]);
    expect(result.map((i) => i.value)).toEqual([23.9, 30, null, null]);
    expect(result.every((i) => i.source === "direct")).toBe(true);
  });
  it("preserves Steam direct prices when Skinport is unavailable", () => {
    expect(
      itemIndicators(null, { lowest: 32, median: 33 }, [market()]).map((i) => i.value),
    ).toEqual([null, null, 32, 33]);
  });
  it("preserves all four direct values when both sources work", () => {
    expect(
      itemIndicators({ min: 23.9, suggested: 30 }, { lowest: 32, median: 33 }, [market()]).map(
        (i) => i.value,
      ),
    ).toEqual([23.9, 30, 32, 33]);
  });
  it("uses identified USD aggregate asks without fabricating reference or 24h median", () => {
    const result = itemIndicators(null, null, [market(), market({ market: "CSFloat", ask: 23.9 })]);
    expect(result.map((i) => [i.source, i.market, i.metric, i.value])).toEqual([
      ["openskin", "Steam", "ask", 31.6],
      ["openskin", "CSFloat", "ask", 23.9],
    ]);
  });
  it("keeps aggregate median distinct from 24h sales and highest bid distinct from ask", () => {
    const result = itemIndicators(null, null, [
      market({ ask: null }),
      market({ market: "CSFloat", ask: null, bid: null }),
    ]);
    expect(result.map((i) => [i.metric, i.value])).toEqual([
      ["bid", 31.25],
      ["median", 31.92],
    ]);
  });
  it("preserves old source timestamps and does not promote stale data to fresh", () => {
    expect(itemIndicators(null, null, [market()])[0]?.updatedAt).toBe("2026-10-27T15:29:11Z");
  });
  it("does not use non-USD or invalid aggregate values", () => {
    const markets = [market({ currency: "BRL" }), market({ ask: NaN, bid: -1, median: null })];
    expect(hasAggregatePrices(markets)).toBe(false);
    expect(itemIndicators(null, null, markets).map((i) => i.value)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
  it("keeps empty values if every source is unavailable", () => {
    expect(itemIndicators(null, null, []).every((i) => i.value === null)).toBe(true);
    expect(steamNoticeMode("unavailable", false)).toBe("warning");
  });
  it("reduces blocked direct Steam to information only when aggregate prices exist", () => {
    expect(steamNoticeMode("rate_limited", hasAggregatePrices([market()]))).toBe("info");
    expect(steamNoticeMode("rate_limited", false)).toBe("warning");
  });
  it("retains stale direct data warnings even when alternatives exist", () => {
    expect(steamNoticeMode("stale", true)).toBe("warning");
    expect(steamNoticeMode("ok", true)).toBe("none");
  });
});
