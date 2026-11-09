import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CATEGORIES, EXTERIORS, pctDiff } from "./parse";
import { searchRows } from "./search";
import {
  getSkinportHistory,
  getSkinportItems,
  getSteamQuote,
  getOpenSkinPrices,
} from "./sources.server";
import { createItemDetailReader } from "./item-detail";
import { getOpenSkinVariants } from "./item-variants";

export const searchSchema = z.object({
  q: z.string().max(100).optional(),
  category: z.enum(CATEGORIES).optional(),
  exterior: z.enum(EXTERIORS).optional(),
  stattrak: z.boolean().optional(),
  souvenir: z.boolean().optional(),
  min: z.number().min(0).optional(),
  max: z.number().min(0).optional(),
  sort: z.enum(["price_asc", "price_desc", "discount", "liquidity", "updated"]).optional(),
  page: z.number().int().min(1).max(500).optional(),
});
export type SearchParams = z.infer<typeof searchSchema>;

export const searchSkins = createServerFn({ method: "GET" })
  .inputValidator((d: SearchParams) => searchSchema.parse(d))
  .handler(async ({ data }) => {
    const { rows, fetchedAt, stale, source, currency } = await getSkinportItems();
    return { ...searchRows(rows, data), fetchedAt, stale, source, currency };
  });

export const suggestSkins = createServerFn({ method: "GET" })
  .inputValidator((d: { q: string }) => z.object({ q: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { rows } = await getSkinportItems();
    const terms = data.q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows
      .filter((r) => r.quantity > 0 && terms.every((t) => r.name.toLowerCase().includes(t)))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8)
      .map((r) => ({ name: r.name, min: r.min, category: r.category }));
  });

export const getDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const { rows, fetchedAt, stale, source, currency } = await getSkinportItems();
  const listed = rows.filter((r) => r.quantity > 0 && r.min != null);
  const byCat: Record<string, { count: number; listings: number }> = {};
  for (const r of listed) {
    const c = (byCat[r.category] ??= { count: 0, listings: 0 });
    c.count++;
    c.listings += r.quantity;
  }
  // "Opportunity" candidates need liquidity (≥ 20 listings) and a meaningful price,
  // so a single stray listing never ranks. Thresholds are USD (both min and suggested
  // come from the same source/currency). Still labelled as candidates, not certainties.
  const opportunities = listed
    .filter((r) => r.suggested && r.suggested >= 4 && r.quantity >= 20 && r.min! >= 1)
    .map((r) => ({ ...r, discountPct: pctDiff(r.min!, r.suggested!) }))
    .filter((r) => (r.discountPct ?? 0) <= -10 && (r.discountPct ?? 0) > -80) // >80% off is more likely bad data than a deal
    .sort((a, b) => a.discountPct! - b.discountPct!)
    .slice(0, 8);
  const mostListed = [...listed].sort((a, b) => b.quantity - a.quantity).slice(0, 8);
  const recent = [...listed]
    .filter((r) => (r.suggested ?? 0) >= 10)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8);
  return {
    fetchedAt,
    stale,
    source,
    currency,
    totals: {
      items: listed.length,
      listings: listed.reduce((s, r) => s + r.quantity, 0),
    },
    byCat,
    opportunities,
    mostListed,
    recent,
  };
});

// All heavy catalog access remains in the search and dashboard endpoints.
// Item details use only per-item APIs and a limited variants search.
const readItem = createItemDetailReader({
  history: getSkinportHistory,
  steam: getSteamQuote,
  openskin: getOpenSkinPrices,
  variants: getOpenSkinVariants,
});

export const getItem = createServerFn({ method: "GET" })
  .inputValidator((d: { name: string }) => z.object({ name: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => readItem(data.name));
