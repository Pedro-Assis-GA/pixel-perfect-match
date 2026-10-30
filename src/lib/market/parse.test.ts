import { describe, expect, it } from "vitest";
import { FEES, netAfterSale, parseBRL, parseMarketName, pctDiff } from "./parse";

describe("market rules", () => {
  it("parses StatTrak knife with exterior", () => {
    const p = parseMarketName("★ StatTrak™ Karambit | Doppler (Factory New)");
    expect(p).toMatchObject({
      category: "Knife",
      stattrak: true,
      exterior: "Factory New",
      skin: "Doppler",
    });
  });
  it("Steam seller receives ~86.96% of listed price", () => {
    expect(netAfterSale(100, FEES.steam)).toBe(86.96);
  });
  it("Skinport seller fee is 8%", () => {
    expect(netAfterSale(100, FEES.skinport)).toBe(92);
  });
  it("Steam wallet is not cash", () => {
    expect(FEES.steam.cashOut).toBe(false);
  });
  it("parses Steam BRL strings", () => {
    expect(parseBRL("R$ 1.163,55")).toBe(1163.55);
  });
  it("discount vs reference", () => {
    expect(pctDiff(80, 100)).toBe(-20);
  });
});
