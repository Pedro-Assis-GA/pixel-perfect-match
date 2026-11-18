import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { imageBucket, imageKey } from "@/lib/market/image-key";
import { SkinImage } from "./SkinImage";
import { renderToString } from "react-dom/server";
import { Updated, SkinCard } from "./bits";
import { MarketTicker } from "./MarketTicker";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    to,
    ...rest
  }: {
    children: ReactNode;
    params?: { name: string };
    to: string;
  }) => (
    <a href={params ? `/item/${encodeURIComponent(params.name)}` : to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/market/market.functions", () => ({ getTickerPrice: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("visual market regression", () => {
  it("renders stable source timestamps before hydration across a minute boundary", () => {
    vi.useFakeTimers();
    const ts = Date.UTC(2026, 10, 17, 12);
    vi.setSystemTime(ts + 29_000);
    const before = renderToString(<Updated ts={ts} />);
    vi.setSystemTime(ts + 31_000);
    expect(renderToString(<Updated ts={ts} />)).toBe(before);
    vi.useRealTimers();
  });

  it.each([
    "AK-47 | Redline (Field-Tested)",
    "StatTrak™ AK-47 | Redline (Minimal Wear)",
    "Danger Zone Case",
    "Sticker | FaZe Clan | Cologne 2016",
    "★ Karambit | Fade (Factory New)",
  ])("resolves artwork from static catalog for %s", (name) => {
    const entries = JSON.parse(
      readFileSync(`public/images/catalog/${imageBucket(name)}.json`, "utf8"),
    ) as Record<string, string>;
    expect(entries[imageKey(name)]).toMatch(/^https:\/\//);
  });

  it("keeps paint finishes separate when normalizing variants", () => {
    expect(imageKey("StatTrak™ AK-47 | Redline (Field-Tested)")).toBe("AK-47 | Redline");
    expect(imageKey("AK-47 | Redline (Field-Tested)")).not.toBe(
      imageKey("AK-47 | Asiimov (Field-Tested)"),
    );
  });

  it("renders supplied artwork and handles broken image without pretending another item", () => {
    render(<SkinImage name="test skin" src="https://example.com/art.png" />);
    fireEvent.error(screen.getByRole("img", { name: "test skin" }));
    expect(screen.getByRole("img", { name: "Imagem indisponível: test skin" })).toBeInTheDocument();
  });

  it("deduplicates static lookups and never calls Steam for cards", async () => {
    const name = "Danger Zone Case";
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ [name]: "https://example.com/case.png" }),
    });
    vi.stubGlobal("fetch", fetcher);
    render(
      <>
        <SkinImage name={name} />
        <SkinImage name={name} />
      </>,
    );
    await waitFor(() => expect(screen.getAllByRole("img", { name })).toHaveLength(2));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(`/images/catalog/${imageBucket(name)}.json`);
  });

  it("favorites can be toggled without nesting a button in the item link", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(
      <SkinCard
        r={{
          name: "AK-47 | Redline (Field-Tested)",
          min: 12,
          suggested: 15,
          quantity: 22,
          category: "Rifle",
          exterior: "Field-Tested",
          stattrak: false,
          souvenir: false,
          updatedAt: Date.now() / 1000,
          discountPct: -20,
        }}
      />,
    );
    const add = screen.getByRole("button", { name: "Adicionar aos favoritos" });
    expect(add.closest("a")).toBeNull();
    fireEvent.click(add);
    expect(screen.getByRole("button", { name: "Remover dos favoritos" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(JSON.parse(localStorage.getItem("skinscope:favorites")!)).toContain(
      "AK-47 | Redline (Field-Tested)",
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      `/item/${encodeURIComponent("AK-47 | Redline (Field-Tested)")}`,
    );
  });

  it("ticker exposes real quote by touch toggle, supports pause and links to the item", () => {
    const client = new QueryClient();
    client.setQueryData(["ticker-price", "AK-47 | Redline (Field-Tested)"], {
      min: 12,
      updatedAt: new Date().toISOString(),
    });
    render(
      <QueryClientProvider client={client}>
        <MarketTicker />
      </QueryClientProvider>,
    );
    const quote = screen.getByRole("button", {
      name: "Ver cotação de AK-47 | Redline (Field-Tested)",
    });
    expect(quote).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(quote);
    expect(quote).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("link", { name: "Ver item →" })[0]).toHaveAttribute(
      "href",
      `/item/${encodeURIComponent("AK-47 | Redline (Field-Tested)")}`,
    );
    expect(screen.getAllByText(/via OpenSkin/)).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "Pausar faixa de mercado" }));
    expect(screen.getByRole("button", { name: "Retomar faixa de mercado" })).toBeInTheDocument();
    fireEvent.keyDown(quote, { key: "Escape" });
    expect(quote).toHaveAttribute("aria-expanded", "false");
  });
});
