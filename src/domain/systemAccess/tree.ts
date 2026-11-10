// Turning flat resource rows into a tree for display.

export interface TreeRow {
  id: string;
  parent_id: string | null;
  name: string;
  sort_order?: number;
}

export interface TreeNode<T extends TreeRow> {
  row: T;
  depth: number;
  children: TreeNode<T>[];
}

/** Roots and children sorted by sort_order, then name. Rows whose parent is missing become roots. */
export function buildTree<T extends TreeRow>(rows: T[]): TreeNode<T>[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const children = new Map<string | null, T[]>();
  for (const r of rows) {
    const parent = r.parent_id && byId.has(r.parent_id) ? r.parent_id : null;
    children.set(parent, [...(children.get(parent) ?? []), r]);
  }
  const order = (a: T, b: T) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "he");
  const make = (parent: string | null, depth: number): TreeNode<T>[] =>
    (children.get(parent) ?? []).sort(order).map((row) => ({ row, depth, children: make(row.id, depth + 1) }));
  return make(null, 0);
}

/** Nodes in display order, skipping the children of collapsed nodes. */
export function visibleNodes<T extends TreeRow>(roots: TreeNode<T>[], expanded: ReadonlySet<string>): TreeNode<T>[] {
  const out: TreeNode<T>[] = [];
  const walk = (nodes: TreeNode<T>[]) => {
    for (const n of nodes) {
      out.push(n);
      if (expanded.has(n.row.id)) walk(n.children);
    }
  };
  walk(roots);
  return out;
}
