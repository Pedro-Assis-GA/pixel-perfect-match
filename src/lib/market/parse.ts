// Pure helpers: name parsing, categories and fee math. No network.

export const EXTERIORS = [
  "Factory New",
  "Minimal Wear",
  "Field-Tested",
  "Well-Worn",
  "Battle-Scarred",
] as const;
export type Exterior = (typeof EXTERIORS)[number];

export const CATEGORIES = [
  "Rifle",
  "Sniper",
  "Pistol",
  "SMG",
  "Shotgun",
  "Machinegun",
  "Knife",
  "Gloves",
  "Agent",
  "Sticker",
  "Container",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  Rifle: "Rifles",
  Sniper: "Snipers",
  Pistol: "Pistolas",
  SMG: "SMGs",
  Shotgun: "Shotguns",
  Machinegun: "Metralhadoras",
  Knife: "Facas",
  Gloves: "Luvas",
  Agent: "Agentes",
  Sticker: "Adesivos",
  Container: "Caixas",
  Other: "Outros",
};

const WEAPONS: Record<string, Category> = {
  "AK-47": "Rifle", M4A4: "Rifle", "M4A1-S": "Rifle", FAMAS: "Rifle", "Galil AR": "Rifle",
  AUG: "Rifle", "SG 553": "Rifle",
  AWP: "Sniper", SSG08: "Sniper", "SSG 08": "Sniper", SCAR20: "Sniper", "SCAR-20": "Sniper", G3SG1: "Sniper",
  "Desert Eagle": "Pistol", "USP-S": "Pistol", "Glock-18": "Pistol", P250: "Pistol", "Five-SeveN": "Pistol",
  "Tec-9": "Pistol", "CZ75-Auto": "Pistol", "Dual Berettas": "Pistol", P2000: "Pistol", "R8 Revolver": "Pistol", "Zeus x27": "Pistol",
  "MAC-10": "SMG", MP9: "SMG", MP7: "SMG", "MP5-SD": "SMG", "UMP-45": "SMG", P90: "SMG", "PP-Bizon": "SMG",
  Nova: "Shotgun", XM1014: "Shotgun", "Sawed-Off": "Shotgun", "MAG-7": "Shotgun",
  M249: "Machinegun", Negev: "Machinegun",
};

export interface ParsedName {
  weapon: string | null;
  skin: string | null;
  exterior: Exterior | null;
  stattrak: boolean;
  souvenir: boolean;
  category: Category;
}

export function parseMarketName(name: string): ParsedName {
  let n = name.trim();
  const isStar = n.startsWith("★");
  if (isStar) n = n.replace(/^★\s*/, "");
  const stattrak = /StatTrak™/.test(n);
  n = n.replace(/StatTrak™\s*/, "");
  const souvenir = /^Souvenir\s/.test(n);
  n = n.replace(/^Souvenir\s/, "");

  let exterior: Exterior | null = null;
  const m = n.match(/\(([^)]+)\)\s*$/);
  if (m && (EXTERIORS as readonly string[]).includes(m[1])) {
    exterior = m[1] as Exterior;
    n = n.slice(0, m.index).trim();
  }

  const [weaponRaw, skinRaw] = n.split(" | ");
  const weapon = weaponRaw?.trim() || null;
  const skin = skinRaw?.trim() || null;

  let category: Category = "Other";
  if (name.startsWith("Sticker |") || name.startsWith("Patch |")) category = "Sticker";
  else if (/Case|Capsule|Package|Souvenir Package/.test(name) && !skin) category = "Container";
  else if (isStar && /Gloves|Wraps/.test(n)) category = "Gloves";
  else if (isStar) category = "Knife";
  else if (weapon && WEAPONS[weapon]) category = WEAPONS[weapon];
  else if (skin && /SWAT|FBI|SAS|Guerrilla|Phoenix|Sabre|Elite Crew|NSWC|TACP|Gendarmerie|NZSAS|SEAL|Professional|Brazilian|KSK|Spetsnaz|Cavalry/.test(skin)) category = "Agent";

  return { weapon, skin, exterior, stattrak, souvenir, category };
}

/**
 * Publicly documented marketplace fees (verified Oct 2026 from each site's help pages).
 * `confirmed: false` means the value is an approximation the UI must flag.
 */
export interface FeeModel {
  buyerFeePct: number;
  sellerFeePct: number;
  confirmed: boolean;
  cashOut: boolean; // can sale proceeds be withdrawn as real money?
  note: string;
}

export const FEES: Record<"skinport" | "steam", FeeModel> = {
  skinport: {
    buyerFeePct: 0,
    sellerFeePct: 8,
    confirmed: true,
    cashOut: true,
    note: "Taxa de venda de 8% (6% em itens acima de €1000). Saque para conta bancária disponível.",
  },
  steam: {
    buyerFeePct: 0,
    sellerFeePct: 13.04,
    confirmed: true,
    cashOut: false,
    note: "Preço exibido já inclui 15% de taxas (5% Steam + 10% CS2); o vendedor recebe ~86,96%. Saldo fica na carteira Steam e não é sacável.",
  },
};

/** Net amount a seller receives when listing at `price`. */
export function netAfterSale(price: number, fee: FeeModel): number {
  return round2(price * (1 - fee.sellerFeePct / 100));
}

/** Total cost to buy at `price`. */
export function effectiveBuyCost(price: number, fee: FeeModel): number {
  return round2(price * (1 + fee.buyerFeePct / 100));
}

export function pctDiff(value: number, reference: number): number | null {
  if (!reference || !isFinite(reference)) return null;
  return round2(((value - reference) / reference) * 100);
}

/** Parses Steam formatted BRL strings like "R$ 1.163,55". */
export function parseBRL(s: string | undefined | null): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const v = parseFloat(cleaned);
  return isFinite(v) ? v : null;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
