import { describe, expect, it } from "vitest";
import { parseMarketName } from "./parse";
import { PAGE_SIZE, searchRows } from "./search";
import type { SkinRow } from "./sources.server";

const row = (name: string, min: number | null, quantity = 5): SkinRow => ({
  name, ...parseMarketName(name), suggested: 100, min, median: null, mean: null, max: null, quantity, updatedAt: 0, url: "",
});
const rows = [
  row("AK-47 | Redline (Field-Tested)", 115),
  row("StatTrak™ AK-47 | Redline (Field-Tested)", 300),
  row("Souvenir AWP | Safari Mesh (Factory New)", 20),
  row("★ Karambit | Doppler (Factory New)", 5000),
  row("AK-47 | Redline (Minimal Wear)", 200),
  row("AK-47 | Empty (Field-Tested)", null),
  row("AK-47 | Zero (Field-Tested)", 10, 0),
];

describe("search filters", () => {
  it("excludes items without a listing price or with zero listings", () => {
    expect(searchRows(rows, {}).total).toBe(5);
  });
  it("category", () => {
    expect(searchRows(rows, { category: "Knife" }).items.map((r) => r.name)).toEqual(["★ Karambit | Doppler (Factory New)"]);
  });
  it("exterior", () => {
    expect(searchRows(rows, { exterior: "Factory New" }).total).toBe(2);
  });
  it("price range is inclusive on lowest listing", () => {
    expect(searchRows(rows, { min: 115, max: 300, sort: "price_asc" }).items.map((r) => r.min)).toEqual([115, 200, 300]);
  });
  it("StatTrak only / non-StatTrak", () => {
    expect(searchRows(rows, { stattrak: true }).total).toBe(1);
    expect(searchRows(rows, { stattrak: false, souvenir: false }).total).toBe(3);
  });
  it("Souvenir only", () => {
    expect(searchRows(rows, { souvenir: true }).items[0]!.name).toContain("Souvenir");
  });
  it("text search requires every term", () => {
    expect(searchRows(rows, { q: "redline field" }).total).toBe(2);
  });
  it("sorts by price ascending and descending", () => {
    expect(searchRows(rows, { sort: "price_asc" }).items.map((r) => r.min)).toEqual([20, 115, 200, 300, 5000]);
    expect(searchRows(rows, { sort: "price_desc" }).items.map((r) => r.min)).toEqual([5000, 300, 200, 115, 20]);
  });
  it("paginates 48 per page and keeps filter + sort on later pages", () => {
    const many = Array.from({ length: 100 }, (_, i) => row(`AK-47 | Redline (Field-Tested) #${i}`, i + 1));
    const p2 = searchRows([...many, row("AWP | X (Factory New)", 0.5)], { q: "redline", sort: "price_desc", page: 2 });
    expect(PAGE_SIZE).toBe(48);
    expect(p2.total).toBe(100);
    expect(p2.pages).toBe(3);
    expect(p2.items[0]!.min).toBe(52);
    expect(p2.items.every((r) => r.name.includes("Redline"))).toBe(true);
  });
});
