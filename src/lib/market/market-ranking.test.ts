import { describe, expect, it, vi } from "vitest";
import { getDashboard, suggestSkins } from "./market.functions";
import { parseMarketName, pctDiff } from "./parse";
import { getSkinportItems, type SkinRow, type SkinportItems } from "./sources.server";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      inputValidator: () => builder,
      handler: <T, R>(handler: (input: { data: T }) => R) => handler,
    };
    return builder;
  },
}));

vi.mock("./sources.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sources.server")>()),
  getSkinportItems: vi.fn(),
}));

function row(id: string, overrides: Partial<SkinRow> = {}): SkinRow {
  const name = `AK-47 | Candidate ${id} (Field-Tested)`;
  return {
    ...parseMarketName(name),
    name,
    min: 15,
    suggested: 25,
    median: 18,
    mean: 18,
    max: 40,
    quantity: 30,
    updatedAt: 1_700_000_000,
    url: `https://example.test/${id}`,
    currency: "USD",
    ...overrides,
  };
}

function catalog(rows: SkinRow[]): SkinportItems {
  return { rows, fetchedAt: 1_700_000_000_000, stale: true, source: "openskin", currency: "USD" };
}

function legacyDashboard({ rows, fetchedAt, stale, source, currency }: SkinportItems) {
  const listed = rows.filter((r) => r.quantity > 0 && r.min != null);
  const byCat: Record<string, { count: number; listings: number }> = {};
  for (const r of listed) {
    const category = (byCat[r.category] ??= { count: 0, listings: 0 });
    category.count++;
    category.listings += r.quantity;
  }
  return {
    fetchedAt,
    stale,
    source,
    currency,
    totals: { items: listed.length, listings: listed.reduce((s, r) => s + r.quantity, 0) },
    byCat,
    opportunities: listed
      .filter((r) => r.suggested && r.suggested >= 4 && r.quantity >= 20 && r.min! >= 1)
      .map((r) => ({ ...r, discountPct: pctDiff(r.min!, r.suggested!) }))
      .filter((r) => (r.discountPct ?? 0) <= -10 && (r.discountPct ?? 0) > -80)
      .sort((a, b) => a.discountPct! - b.discountPct!)
      .slice(0, 8),
    mostListed: [...listed].sort((a, b) => b.quantity - a.quantity).slice(0, 8),
    recent: listed
      .filter((r) => (r.suggested ?? 0) >= 10)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8),
  };
}

function legacySuggestions(rows: SkinRow[], q: string) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  return rows
    .filter((r) => r.quantity > 0 && terms.every((t) => r.name.toLowerCase().includes(t)))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 8)
    .map((r) => ({ name: r.name, min: r.min, category: r.category }));
}

const mixedRows = [
  ...Array.from({ length: 12 }, (_, i) => row(`tie-${i}`)),
  row("best-discount", { min: 6 }),
  row("most-listed", { quantity: 100, min: 23 }),
  row("newest", { updatedAt: 1_700_001_000 }),
  row("exactly-minus-ten", { min: 9, suggested: 10 }),
  row("exactly-minus-eighty", { min: 5 }),
  row("no-reference", { suggested: null }),
  row("invalid-reference", { suggested: Infinity }),
  row("low-reference", { suggested: 3.99, min: 2 }),
  row("low-price", { min: 0 }),
  row("no-price", { min: null, quantity: 150 }),
  row("not-listed", { quantity: 0 }),
  row("invalid-quantity", { quantity: NaN }),
  row("low-liquidity", { quantity: 19 }),
  row("alternate-name", { name: "AWP | Another skin", quantity: 200 }),
];

describe("dashboard and suggestion rankings", () => {
  it.each([
    { name: "empty", rows: [] },
    { name: "short", rows: [row("one"), row("two", { quantity: 50 })] },
    { name: "mixed with ties across the cutoff", rows: mixedRows },
    { name: "reversed with ties across the cutoff", rows: [...mixedRows].reverse() },
  ])("matches the stable full sort for a $name catalog", async ({ rows }) => {
    const snapshot = catalog(Object.freeze(rows) as SkinRow[]);
    vi.mocked(getSkinportItems).mockResolvedValue(snapshot);
    expect(await getDashboard()).toStrictEqual(legacyDashboard(snapshot));
    for (const q of ["candidate", "AK-47  TIE", "no-price", "unmatched", " "]) {
      expect(await suggestSkins({ data: { q } })).toStrictEqual(legacySuggestions(rows, q));
    }
  });

  it("never sorts a collection larger than the result limit", async () => {
    const rows = Array.from({ length: 128 }, (_, i) => row(String(i), { quantity: i + 20 }));
    vi.mocked(getSkinportItems).mockResolvedValue(catalog(rows));
    const sort = Array.prototype.sort;
    const rankedSizes: number[] = [];
    const spy = vi.spyOn(Array.prototype, "sort").mockImplementation(function (
      this: unknown[],
      compare,
    ) {
      if (this.length > 8) rankedSizes.push(this.length);
      return sort.call(this, compare);
    });
    try {
      await getDashboard();
      await suggestSkins({ data: { q: "candidate" } });
    } finally {
      spy.mockRestore();
    }
    expect(rankedSizes).toEqual([]);
  });
});
