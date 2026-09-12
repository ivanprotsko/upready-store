// Mapping registry of the Cherkashina migration (rule 18b): one row per source
// entity, the JSON is the record, the .md next to it is a render.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { stamp } from "./psql.mjs";

export function loadRegistry(path) {
  if (existsSync(path)) {
    const r = JSON.parse(readFileSync(path, "utf8"));
    r.rows ??= [];
    return r;
  }
  return { format: "upready.cherkashina-migration-registry/v1", created_at: stamp(), updated_at: null, tenant: null, rows: [] };
}

export function saveRegistry(path, registry) {
  registry.updated_at = stamp();
  registry.summary = summarize(registry.rows);
  writeFileSync(path, JSON.stringify(registry, null, 1) + "\n");
}

export const rowKey = (kind, sourceId) => `${kind}:${sourceId}`;

export function upsertRow(registry, row) {
  const key = rowKey(row.kind, row.source_id);
  const i = registry.rows.findIndex((r) => rowKey(r.kind, r.source_id) === key);
  const merged = { ...(i >= 0 ? registry.rows[i] : {}), ...row, checked_at: stamp() };
  if (i >= 0) registry.rows[i] = merged;
  else registry.rows.push(merged);
  return merged;
}

export function findRow(registry, kind, sourceId) {
  const key = rowKey(kind, sourceId);
  return registry.rows.find((r) => rowKey(r.kind, r.source_id) === key) ?? null;
}

export function summarize(rows) {
  const s = {};
  for (const r of rows) {
    s[r.kind] ??= { total: 0, migrated: 0, skipped: 0, failed: 0, pending: 0 };
    s[r.kind].total += 1;
    s[r.kind][r.status] = (s[r.kind][r.status] ?? 0) + 1;
  }
  return s;
}
