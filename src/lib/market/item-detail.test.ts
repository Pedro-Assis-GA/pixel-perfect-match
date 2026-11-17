import { describe, expect, it, vi } from "vitest";
import { createItemDetailReader } from "./item-detail";

const name = "AK-47 | Slate (Factory New)";

describe("item detail without the bulk catalog", () => {
  it("only calls per-item adapters, retaining Steam, OpenSkin and history", async () => {
    const history = vi.fn(async () => null);
    const steam = vi.fn(async () => ({
      quote: {
        lowest: 12,
        median: 13,
        volume24h: 2,
        url: "https://steamcommunity.com",
        image: null,
      },
      status: "ok" as const,
      fetchedAt: 123,
      retryAt: null,
    }));
    const openskin = vi.fn(async () => ({
      markets: [
        {
          market: "Skinport",
          ask: 10,
          bid: null,
          median: 11,
          listings: 20,
          volume24h: null,
          currency: "USD",
          updatedAt: "2026-10-30T12:00:00Z",
          url: null,
        },
      ],
      icon: null,
      status: "ok" as const,
      fetchedAt: 456,
      retryAt: null,
    }));
    const variants = vi.fn(async () => ({ variants: [], status: "ok" as const }));
    const load = createItemDetailReader({ history, steam, openskin, variants });
    const result = await load(name);
    expect(history).toHaveBeenCalledWith(name);
    expect(steam).toHaveBeenCalledWith(name);
    expect(openskin).toHaveBeenCalledWith(name);
    expect(variants).toHaveBeenCalledWith(name);
    expect(result.skinport).toBeNull(); // no false direct quote
    expect(result.openskin.markets).toHaveLength(1);
    expect(result.openskin.markets[0]?.ask).toBe(10);
    expect(result.steam?.lowest).toBe(12);
    expect(result.variantsStatus).toBe("ok");
  });

  it("returns unavailable statuses instead of throwing when all adapters fail", async () => {
    const failure = async () => {
      throw new Error("temporarily unavailable");
    };
    const load = createItemDetailReader({
      history: failure,
      steam: failure,
      openskin: failure,
      variants: failure,
    });
    const result = await load(name);
    expect(result.history).toBeNull();
    expect(result.steam).toBeNull();
    expect(result.openskin.status).toBe("unavailable");
    expect(result.variantsStatus).toBe("unavailable");
  });
});
