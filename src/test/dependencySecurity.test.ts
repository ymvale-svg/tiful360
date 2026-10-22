// @vitest-environment node
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
  it("accepts 100 nested blocks but rejects 101, including mixed blocks", () => {
    expect(() => braces.compile("(".repeat(100) + "x" + ")".repeat(100))).not.toThrow();
    expect(() => braces.parse("{(".repeat(51) + "x" + ")}".repeat(51))).toThrow("security limit");
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