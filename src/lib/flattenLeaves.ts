// Walk a JSON object and return its scalar leaves as { path, value } pairs.
// - Arrays of primitives are returned as a single leaf with a JSON-encoded value.
// - Arrays of objects are SKIPPED (caller renders them as their own section).
// - null / undefined leaves are returned with value === null so the UI can hide
//   them behind a "show empty" toggle.

export type Leaf = { path: string; value: string | number | boolean | null };

const MAX_DEPTH = 6;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function flattenLeaves(input: unknown, prefix = "", depth = 0): Leaf[] {
  if (depth > MAX_DEPTH) return [];
  if (input === null || input === undefined) {
    return prefix ? [{ path: prefix, value: null }] : [];
  }
  if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
    return [{ path: prefix, value: input }];
  }
  if (Array.isArray(input)) {
    if (input.length === 0) return prefix ? [{ path: prefix, value: null }] : [];
    const allPrim = input.every(
      (v) => v === null || ["string", "number", "boolean"].includes(typeof v)
    );
    if (allPrim) {
      return [{ path: prefix, value: JSON.stringify(input) }];
    }
    // Array of objects -> handled separately by caller
    return [];
  }
  if (isPlainObject(input)) {
    const out: Leaf[] = [];
    for (const key of Object.keys(input)) {
      const next = prefix ? `${prefix}.${key}` : key;
      out.push(...flattenLeaves(input[key], next, depth + 1));
    }
    return out;
  }
  return [];
}

// Resolve a single dot-path against an object. Returns undefined if missing.
export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split(".");
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}
