export function retryAfterMs(value: string | null, now: number): number | null {
  if (!value?.trim()) return null;
  if (/^\d+(\.\d+)?$/.test(value.trim())) {
    const ms = Number(value) * 1000;
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  const ms = Date.parse(value) - now;
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

export interface MarketDiagnostic {
  source: "steam" | "skinport_history";
  endpoint: "priceoverview" | "image" | "sales_history";
  status: number | null;
  failure: "http" | "network" | "invalid_data";
}

// Diagnostics must never change the outcome of a market request.
export function emitDiagnostic(
  callback: ((event: MarketDiagnostic) => void) | undefined,
  event: MarketDiagnostic,
) {
  try {
    callback?.(event);
  } catch {
    /* Observer failures are isolated. */
  }
}
