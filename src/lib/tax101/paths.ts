/** Dot-path access into Tax101FormData ("dependents.2.id_number"). */

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/**
 * Immutable set. Missing array rows along the path are created with `fillRow`
 * (so typing into an empty printed table row creates that row).
 */
export function setPath<T>(obj: T, path: string, value: unknown, fillRow?: (arrayPath: string) => unknown): T {
  const keys = path.split(".");
  const walk = (cur: unknown, i: number, prefix: string): unknown => {
    const key = keys[i];
    const here = prefix ? `${prefix}.${key}` : key;
    if (i === keys.length - 1) {
      if (Array.isArray(cur)) {
        const copy = [...cur];
        copy[Number(key)] = value;
        return copy;
      }
      return { ...(cur as Record<string, unknown>), [key]: value };
    }
    if (Array.isArray(cur)) {
      const idx = Number(key);
      const copy = [...cur];
      while (copy.length <= idx) copy.push(fillRow ? fillRow(prefix) : {});
      copy[idx] = walk(copy[idx], i + 1, here);
      return copy;
    }
    const rec = (cur ?? {}) as Record<string, unknown>;
    return { ...rec, [key]: walk(rec[key], i + 1, here) };
  };
  return walk(obj, 0, "") as T;
}
