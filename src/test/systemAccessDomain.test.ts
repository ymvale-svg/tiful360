import { describe, expect, it } from "vitest";
import { diffTree, expandPrefixes, normalizeTreePath, parseTreeExport } from "@/domain/systemAccess/treeImport";
import { buildGroupProtocol, effectiveAccess } from "@/domain/systemAccess/protocol";
import { buildTree, visibleNodes } from "@/domain/systemAccess/tree";

describe("folder tree import", () => {
  it("reads a PowerShell Export-Csv of FullName and strips the drive", () => {
    const csv = [
      "\uFEFF#TYPE Selected.System.IO.DirectoryInfo",
      '"FullName"',
      '"P:\\פרויקטים"',
      '"P:\\פרויקטים\\תכנון"',
      '"P:\\פרויקטים\\חוזים, הסכמים"',
      "",
    ].join("\r\n");
    const tree = parseTreeExport(csv);
    expect(tree.root).toBe("P:");
    expect(tree.paths).toEqual(["פרויקטים", "פרויקטים\\חוזים, הסכמים", "פרויקטים\\תכנון"]);
    expect(tree.skipped).toBe(2);
  });

  it("reads plain UNC lines with forward slashes and duplicates", () => {
    const tree = parseTreeExport("\\\\srv\\data\\כספים\n\\\\srv\\data\\כספים\\\\2026\\\n//srv/data/כספים/2026\n");
    expect(tree.root).toBe("\\\\srv\\data");
    expect(tree.paths).toEqual(["כספים", "כספים\\2026"]);
  });

  it("skips lines from another drive and keeps already-relative lines", () => {
    expect(parseTreeExport("P:\\a\nP:\\a\\b\nS:\\x").paths).toEqual(["a", "a\\b"]);
    expect(parseTreeExport("פרויקטים\\תכנון\nכספים").paths).toEqual(["כספים", "פרויקטים\\תכנון"]);
  });

  it("normalizes separators and spaces", () => {
    expect(normalizeTreePath(" a \\\\ b\\ ")).toBe("a\\b");
  });

  it("previews what an import adds and flags as missing", () => {
    expect([...expandPrefixes(["a\\b\\c"])]).toEqual(["a", "a\\b", "a\\b\\c"]);
    expect(diffTree(["a", "a\\b", "old"], ["a\\b", "a\\new"])).toEqual({ added: ["a\\new"], missing: ["old"] });
  });
});

describe("group protocol", () => {
  const groups = [
    { name: "הנדסה", external_name: "GRP_P_Engineering", resources: [
      { path: "פרויקטים\\תכנון", level: "write" as const },
      { path: "פרויקטים\\חוזים", level: "read" as const },
    ] },
    { name: "משפטי", external_name: null, resources: [{ path: "פרויקטים\\חוזים", level: "write" as const }] },
  ];

  it("lists one row per group and folder, folders sorted within a group", () => {
    expect(buildGroupProtocol(groups).map((r) => [r.group, r.externalName, r.path, r.level])).toEqual([
      ["הנדסה", "GRP_P_Engineering", "פרויקטים\\חוזים", "read"],
      ["הנדסה", "GRP_P_Engineering", "פרויקטים\\תכנון", "write"],
      ["משפטי", null, "פרויקטים\\חוזים", "write"],
    ]);
  });

  it("gives write when any group writes", () => {
    const access = effectiveAccess(groups);
    expect(access.get("פרויקטים\\חוזים")).toBe("write");
    expect(access.get("פרויקטים\\תכנון")).toBe("write");
    expect(effectiveAccess([groups[0]]).get("פרויקטים\\חוזים")).toBe("read");
  });
});


describe("resource tree", () => {
  const rows = [
    { id: "b", parent_id: "a", name: "תכנון" },
    { id: "a", parent_id: null, name: "פרויקטים" },
    { id: "c", parent_id: "a", name: "ביצוע" },
    { id: "d", parent_id: null, name: "כספים" },
    { id: "e", parent_id: "gone", name: "יתום" },
  ];

  it("nests children under parents, sorted by name, orphans as roots", () => {
    const roots = buildTree(rows);
    expect(roots.map((n) => n.row.id)).toEqual(["e", "d", "a"]);
    expect(roots[2].children.map((n) => [n.row.id, n.depth])).toEqual([["c", 1], ["b", 1]]);
  });

  it("shows children only of expanded nodes", () => {
    const roots = buildTree(rows);
    expect(visibleNodes(roots, new Set()).map((n) => n.row.id)).toEqual(["e", "d", "a"]);
    expect(visibleNodes(roots, new Set(["a"])).map((n) => n.row.id)).toEqual(["e", "d", "a", "c", "b"]);
  });
});
