import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CATEGORIES, EXTERIORS, pctDiff } from "./parse";
import { getSkinportHistory, getSkinportItems, getSteamQuote, type SkinRow } from "./sources.server";

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

export interface ResultRow extends SkinRow {
  discountPct: number | null; // lowest listing vs Skinport suggested price
}

const PAGE = 48;

export const searchSkins = createServerFn({ method: "GET" })
  .inputValidator((d: SearchParams) => searchSchema.parse(d))
  .handler(async ({ data }) => {
    const { rows, fetchedAt } = await getSkinportItems();
    const terms = (data.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    let list = rows.filter((r) => {
      if (r.min == null || r.quantity === 0) return false;
      if (terms.length) {
        const n = r.name.toLowerCase();
        if (!terms.every((t) => n.includes(t))) return false;
      }
      if (data.category && r.category !== data.category) return false;
      if (data.exterior && r.exterior !== data.exterior) return false;
      if (data.stattrak !== undefined && r.stattrak !== data.stattrak) return false;
      if (data.souvenir !== undefined && r.souvenir !== data.souvenir) return false;
      if (data.min !== undefined && r.min < data.min) return false;
      if (data.max !== undefined && r.min > data.max) return false;
      return true;
    });
    const withD: ResultRow[] = list.map((r) => ({
      ...r,
      discountPct: r.suggested ? pctDiff(r.min!, r.suggested) : null,
    }));
    const sort = data.sort ?? "liquidity";
    withD.sort((a, b) => {
      switch (sort) {
        case "price_asc": return a.min! - b.min!;
        case "price_desc": return b.min! - a.min!;
        case "discount": return (a.discountPct ?? 999) - (b.discountPct ?? 999);
        case "updated": return b.updatedAt - a.updatedAt;
        default: return b.quantity - a.quantity;
      }
    });
    const page = data.page ?? 1;
    return {
      total: withD.length,
      page,
      pages: Math.max(1, Math.ceil(withD.length / PAGE)),
      items: withD.slice((page - 1) * PAGE, page * PAGE),
      fetchedAt,
    };
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
  const { rows, fetchedAt } = await getSkinportItems();
  const listed = rows.filter((r) => r.quantity > 0 && r.min != null);
  const byCat: Record<string, { count: number; listings: number }> = {};
  for (const r of listed) {
    const c = (byCat[r.category] ??= { count: 0, listings: 0 });
    c.count++;
    c.listings += r.quantity;
  }
  // "Opportunity" candidates need liquidity (≥ 20 listings) and a meaningful price,
  // so a single stray listing never ranks. Still labelled as candidates, not certainties.
  const opportunities = listed
    .filter((r) => r.suggested && r.suggested >= 20 && r.quantity >= 20)
    .map((r) => ({ ...r, discountPct: pctDiff(r.min!, r.suggested!) }))
    .filter((r) => (r.discountPct ?? 0) <= -10)
    .sort((a, b) => a.discountPct! - b.discountPct!)
    .slice(0, 8);
  const mostListed = [...listed].sort((a, b) => b.quantity - a.quantity).slice(0, 8);
  const recent = [...listed]
    .filter((r) => (r.suggested ?? 0) >= 50)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8);
  return {
    fetchedAt,
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

export const getItem = createServerFn({ method: "GET" })
  .inputValidator((d: { name: string }) => z.object({ name: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const [{ rows, fetchedAt }, history, steam] = await Promise.all([
      getSkinportItems(),
      getSkinportHistory(data.name).catch(() => null),
      getSteamQuote(data.name).catch(() => ({ quote: null, status: "unavailable" as const, fetchedAt: null, retryAt: null })),
    ]);
    const skinport = rows.find((r) => r.name === data.name) ?? null;
    const base = skinport ? `${skinport.weapon} | ${skinport.skin}` : null;
    const variants = base
      ? rows
          .filter((r) => r.name !== data.name && r.weapon === skinport!.weapon && r.skin === skinport!.skin && r.min != null)
          .map((r) => ({ name: r.name, min: r.min, quantity: r.quantity, exterior: r.exterior, stattrak: r.stattrak }))
      : [];
    return {
      name: data.name, skinport, history, variants, fetchedAt,
      steam: steam.quote, steamStatus: steam.status, steamFetchedAt: steam.fetchedAt, steamRetryAt: steam.retryAt,
    };
  });
