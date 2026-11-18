// Assemble only one item's prices, history, and a *bounded* variant list.
// Deliberately does not import or call getSkinportItems() or the bulk pricing API.
import type { SkinportHistory, SkinRow } from "./sources.server";
import type { SteamResult } from "./steam";
import type { OpenSkinResult } from "./openskin";
import type { HistoryResult } from "./skinport-history";
import type { ItemVariantsResult } from "./item-variants";

export interface ItemDetailDependencies {
  history: (name: string) => Promise<SkinportHistory | null>;
  historyDetails?: (name: string) => Promise<HistoryResult>;
  steam: (name: string) => Promise<SteamResult>;
  openskin: (name: string) => Promise<OpenSkinResult>;
  variants: (name: string) => Promise<ItemVariantsResult>;
}

export function createItemDetailReader(deps: ItemDetailDependencies) {
  return async (name: string) => {
    const [history, steam, openskin, versionData] = await Promise.all([
      (deps.historyDetails
        ? deps.historyDetails(name)
        : deps.history(name).then((history) => ({
            history,
            status: history ? ("ok" as const) : ("unavailable" as const),
            fetchedAt: null,
            retryAt: null,
          }))
      ).catch(() => ({
        history: null,
        status: "unavailable" as const,
        fetchedAt: null,
        retryAt: null,
      })),
      deps.steam(name).catch(() => ({
        quote: null,
        status: "unavailable" as const,
        fetchedAt: null,
        retryAt: null,
      })),
      deps.openskin(name).catch(() => ({
        markets: [],
        icon: null,
        status: "unavailable" as const,
        fetchedAt: null,
        retryAt: null,
      })),
      deps.variants(name).catch(() => ({
        variants: [],
        status: "unavailable" as const,
      })),
    ]);

    return {
      name,
      // The public Skinport /v1/items endpoint is bulk-only; don't invent a
      // 'direct' price or disguise an OpenSkin report as a Skinport API response.
      skinport: null as SkinRow | null,
      source: "openskin" as const,
      variants: versionData.variants,
      variantsStatus: versionData.status,
      fetchedAt: openskin.fetchedAt ?? 0,
      skinportStale: openskin.status === "stale",
      history: history.history,
      historyStatus: history.status,
      historyFetchedAt: history.fetchedAt,
      historyRetryAt: history.retryAt,
      steam: steam.quote,
      steamStatus: steam.status,
      steamFetchedAt: steam.fetchedAt,
      steamRetryAt: steam.retryAt,
      openskin,
    };
  };
}
