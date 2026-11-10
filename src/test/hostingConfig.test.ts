// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const render = readFileSync(resolve(root, "render.yaml"), "utf8");
const vercel = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};

/** name/value pairs of every `- path: /* … name … value` header entry in render.yaml. */
function renderHeaders(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  const entry = /- path: (\S+)\s+name: ([^\n]+)\s+value: ([^\n]+)/g;
  for (const [, p, name, value] of render.matchAll(entry)) {
    if (p === path) out[name.trim()] = value.trim().replace(/^"(.*)"$/, "$1");
  }
  return out;
}

describe("Render hosting configuration", () => {
  it("sends every security header the current host sends, with the same value", () => {
    const site = renderHeaders("/*");
    for (const { key, value } of vercel.headers.flatMap((h) => h.headers)) {
      expect(site[key], key).toBe(value);
    }
  });

  it("falls back to the SPA shell and never caches the HTML or the service worker", () => {
    expect(render).toMatch(/type: rewrite\s+source: \/\*\s+destination: \/index\.html/);
    expect(renderHeaders("/index.html")["Cache-Control"]).toBe("no-cache");
    expect(renderHeaders("/sw.js")["Cache-Control"]).toBe("no-cache");
  });

  it("installs with Bun from the committed lockfile and publishes the Vite output", () => {
    expect(render).toMatch(/bun install --frozen-lockfile && bun run build/);
    expect(render).toMatch(/staticPublishPath: \.\/dist/);
  });
});
