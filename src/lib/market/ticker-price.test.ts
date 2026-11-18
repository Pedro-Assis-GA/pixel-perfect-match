import { describe, expect, it, vi } from "vitest";
import { getTickerPrice } from "./market.functions";
import { getOpenSkinPrices, getSkinportItems } from "./sources.server";
import type { OpenSkinResult } from "./openskin";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      inputValidator: () => builder,
      handler: <T, R>(handler: (input: { data: T }) => R) => handler,
    };
    return builder;
  },
}));
vi.mock("./sources.server", async (original) => ({
  ...(await original<typeof import("./sources.server")>()),
  getOpenSkinPrices: vi.fn(),
  getSkinportItems: vi.fn(),
}));

describe("lightweight ticker quote", () => {
  it.each(["fresh", "expired", "foreign currency", "missing time", "unavailable"])(
    "handles %s without reading a full catalog",
    async (scenario) => {
      const ts = new Date(
        Date.now() - (scenario === "expired" ? 25 * 3600_000 : 60_000),
      ).toISOString();
      const response: OpenSkinResult = {
        status: "ok",
        fetchedAt: Date.now(),
        retryAt: null,
        markets:
          scenario === "unavailable"
            ? []
            : [
                {
                  market: "Skinport",
                  ask: 12.5,
                  bid: null,
                  median: null,
                  listings: 30,
                  volume24h: null,
                  currency: scenario === "foreign currency" ? "EUR" : "USD",
                  updatedAt: scenario === "missing time" ? null : ts,
                  url: null,
                },
              ],
      };
      vi.mocked(getOpenSkinPrices).mockResolvedValue(response);
      const result = await getTickerPrice({ data: { name: "AK-47 | Redline (Field-Tested)" } });
      expect(result.min).toBe(scenario === "fresh" ? 12.5 : null);
      expect(getSkinportItems).not.toHaveBeenCalled();
      expect(getOpenSkinPrices).toHaveBeenLastCalledWith("AK-47 | Redline (Field-Tested)");
    },
  );
});
