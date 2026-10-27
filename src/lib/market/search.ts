// Pure search/filter/sort/paginate over Skinport rows (shared by server fn and tests).
import { pctDiff } from "./parse";
import type { SearchParams } from "./market.functions";
import type { SkinRow } from "./sources.server";

export interface ResultRow extends SkinRow {
  discountPct: number | null; // lowest listing vs Skinport suggested price
}

export const PAGE_SIZE = 48;

export function searchRows(rows: SkinRow[], data: SearchParams) {
  const terms = (data.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const list = rows.filter((r) => {
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
    pages: Math.max(1, Math.ceil(withD.length / PAGE_SIZE)),
    items: withD.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
  };
}
