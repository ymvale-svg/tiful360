// @vitest-environment node
/// <reference types="node" />
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const braces = require("braces");

describe("braces security patch", () => {
  it.each(["compile", "expand", "parse", "stringify"])("rejects malicious nesting in %s", (method) => {
    for (const [open, close] of [["{", "}"], ["(", ")"]]) {
      const pattern = open.repeat(2000) + "a,b" + close.repeat(2000);
      expect(() => braces[method](pattern)).toThrow("Nesting depth exceeds security limit (100)");
    }
  });
  it("preserves project glob alternatives, ranges and literal escaping", () => {
    expect(braces.expand("src/**/*.{ts,tsx}")).toEqual(["src/**/*.ts", "src/**/*.tsx"]);
    expect(braces.compile("src/{pages,components}/**/*.{ts,tsx}")).toBe("src/(pages|components)/**/*.(ts|tsx)");
    expect(braces.expand("asset-{1..3}")).toEqual(["asset-1", "asset-2", "asset-3"]);
    expect(braces.expand("\\{literal\\}")).toEqual(["{literal}"]);
  });
  it.each(["compile", "expand", "parse", "stringify"])("enforces the exact 100-block boundary in %s", (method) => {
    for (const [open, close] of [["(", ")"], ["{", "}"]]) {
      expect(() => braces[method](open.repeat(100) + "x" + close.repeat(100))).not.toThrow();
      expect(() => braces[method](open.repeat(101) + "x" + close.repeat(101))).toThrow("Nesting depth exceeds security limit (100)");
    }
    expect(() => braces[method]("{(".repeat(51) + "x" + ")}".repeat(51))).toThrow("security limit");
  });
  it.each(["compile", "expand", "stringify"])("bounds caller-supplied recursive ASTs in %s", (method) => {
    const ast: { type: string; nodes: unknown[] } = { type: "root", nodes: [] };
    ast.nodes.push(ast);
    expect(() => braces[method](ast)).toThrow("security limit");
  });
});

describe("development transformer compatibility", () => {
  it("transforms TypeScript through the updated drizzle loader dependency", async () => {
    const { transform } = await import("@esbuild-kit/core-utils");
    const result = await transform("export const count: number = 42;", "/tmp/dependency-security-fixture.ts", { target: "node18" });
    expect(result.code).toContain("42");
    expect(result.code).not.toContain(": number");
  });
});
describe("dependency installation source", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const root = path.resolve(__dirname, "../..");
  const lock = fs.readFileSync(path.join(root, "bun.lock"), "utf8");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

  it("resolves packages from the public npm registry, not a hosting provider's private cache", () => {
    expect(lock).not.toMatch(/npm\.pkg\.dev/);
    expect(lock).not.toMatch(/lovable-core-prod/);
  });

  it("keeps Bun as the only lockfile", () => {
    expect(fs.existsSync(path.join(root, "package-lock.json"))).toBe(false);
    expect(fs.existsSync(path.join(root, "yarn.lock"))).toBe(false);
    expect(fs.existsSync(path.join(root, "pnpm-lock.yaml"))).toBe(false);
  });

  it("has no Lovable editor-only dev tooling", () => {
    const dev = Object.keys(pkg.devDependencies ?? {});
    expect(dev).not.toContain("lovable-tagger");
    expect(dev.filter((d) => d.startsWith("@lovable.dev/vite-plugin-"))).toEqual([]);
    const vite = fs.readFileSync(path.join(root, "vite.config.ts"), "utf8");
    expect(vite).not.toMatch(/lovable-tagger|__lovable_backend_proxy/);
  });
});
