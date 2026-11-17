import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Cloudflare Worker configuration", () => {
  it("declares the existing Worker and enables branch Previews in Nitro's source config", () => {
    const config = JSON.parse(readFileSync("wrangler.json", "utf-8"));

    expect(config).toStrictEqual({
      name: "skin-scope",
      previews: {},
    });
  });
});
