import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("never reuses a historical snapshot beyond 24 hours after a source failure", async () => {
  let time = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => time);
  const period = { min: 10, max: 12, avg: 11, median: 11, volume: 3 };
  const snapshot = {
    last_24_hours: period,
    last_7_days: period,
    last_30_days: period,
    last_90_days: period,
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify([snapshot])))
    .mockResolvedValue(new Response(null, { status: 403 }));
  vi.stubGlobal("fetch", fetcher);
  const { getSkinportHistory } = await import("./sources.server");
  expect(await getSkinportHistory("HISTORY-AGE")).toEqual(snapshot);
  time += 25 * 3600_000;
  expect(await getSkinportHistory("HISTORY-AGE")).toBeNull();
});
