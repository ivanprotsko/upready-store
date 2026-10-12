#!/usr/bin/env node
// deploy/auto/journal-check.mjs: checks a release journal or a state file of a release agent against its
// schema (journal.schema.json, state.schema.json) and the rules a schema cannot say (t-2026-10-12-30).
// The Hub reads these files from the hosts; this is the check it and the tests run on them.
//
//   node deploy/auto/journal-check.mjs <file.json>…
//
// The kind of each file comes from its own `schema` field. Prints one line per problem; exit 0 when every
// file is clean, 1 when any is not, 2 on a file that does not read.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMAS = {
  "upready-store.release-journal/1": JSON.parse(readFileSync(path.join(here, "journal.schema.json"), "utf8")),
  "upready-store.release-state/1": JSON.parse(readFileSync(path.join(here, "state.schema.json"), "utf8")),
};

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
const typeMatches = (want, v) => want === typeOf(v) || (want === "number" && typeof v === "number");

// The part of JSON Schema these two schemas use: type, const, enum, pattern, minLength, minimum, maximum,
// required, properties, additionalProperties: false, items, oneOf and a local $ref.
export function validate(schema, value, root = schema, at = "$") {
  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, "").split("/").reduce((o, k) => o?.[k], root);
    if (!target) return [`${at}: unknown $ref ${schema.$ref}`];
    return validate(target, value, root, at);
  }
  if (schema.oneOf) {
    const passing = schema.oneOf.filter((s) => validate(s, value, root, at).length === 0).length;
    return passing === 1 ? [] : [`${at}: matches ${passing} of the ${schema.oneOf.length} allowed shapes, not exactly one`];
  }
  const errors = [];
  if (schema.type) {
    const wants = [].concat(schema.type);
    if (!wants.some((t) => typeMatches(t, value))) return [`${at}: is ${typeOf(value)}, expected ${wants.join(" or ")}`];
  }
  if ("const" in schema && value !== schema.const) errors.push(`${at}: is ${JSON.stringify(value)}, expected ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: ${JSON.stringify(value)} is not one of ${schema.enum.join(", ")}`);
  if (typeof value === "string") {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: ${JSON.stringify(value)} does not match ${schema.pattern}`);
    if (schema.minLength && value.length < schema.minLength) errors.push(`${at}: shorter than ${schema.minLength}`);
  }
  if (typeof value === "number") {
    if ("minimum" in schema && value < schema.minimum) errors.push(`${at}: ${value} < ${schema.minimum}`);
    if ("maximum" in schema && value > schema.maximum) errors.push(`${at}: ${value} > ${schema.maximum}`);
  }
  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${at}: no ${key}`);
    for (const [key, v] of Object.entries(value)) {
      if (schema.properties?.[key]) errors.push(...validate(schema.properties[key], v, root, `${at}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${at}: unexpected field ${key}`);
    }
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => errors.push(...validate(schema.items, v, root, `${at}[${i}]`)));
  return errors;
}

// What a schema cannot say about a journal.
export function journalRules(journal) {
  const errors = [];
  const records = journal.records ?? [];
  const ids = new Set();
  let running = 0;
  records.forEach((r, i) => {
    const at = `$.records[${i}]`;
    if (ids.has(r.id)) errors.push(`${at}: id ${r.id} appears twice`);
    ids.add(r.id);
    if (r.instance !== journal.instance) errors.push(`${at}: instance ${r.instance} in the journal of ${journal.instance}`);
    if (r.result === "running") {
      running += 1;
      if (r.end !== null) errors.push(`${at}: running, yet it has an end`);
    } else if (r.end === null) errors.push(`${at}: ${r.result}, yet no end`);
    if (r.end && r.start && r.end < r.start) errors.push(`${at}: ends before it starts`);
    if (r.result === "failure" && r.step === null) errors.push(`${at}: a failure names no step`);
    if ((r.kind === "adopted") !== (r.result === "adopted")) errors.push(`${at}: kind ${r.kind} with result ${r.result}`);
    if (i > 0 && r.start < records[i - 1].start) errors.push(`${at}: starts before the record above it`);
    if (records.slice(0, i).some((p) => p.sha === r.sha)) errors.push(`${at}: ${r.sha.slice(0, 8)} is in the journal twice (a sha is never released again)`);
  });
  if (running > 1) errors.push(`$.records: ${running} records are running, at most one may be`);
  return errors;
}

export function check(doc) {
  const schema = SCHEMAS[doc?.schema];
  if (!schema) return [`$.schema: ${JSON.stringify(doc?.schema)} is not a known release file`];
  const errors = validate(schema, doc);
  if (doc.schema === "upready-store.release-journal/1" && errors.length === 0) errors.push(...journalRules(doc));
  return errors;
}

export function main(files, out = console.log) {
  if (files.length === 0) {
    out("usage: node deploy/auto/journal-check.mjs <journal.json|state.json>…");
    return 2;
  }
  let code = 0;
  for (const file of files) {
    let doc;
    try {
      doc = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      out(`${file}: does not read as JSON: ${e.message}`);
      return 2;
    }
    const errors = check(doc);
    for (const e of errors) out(`${file}: ${e}`);
    if (errors.length) code = 1;
    else out(`${file}: ok (${doc.schema}${doc.records ? `, ${doc.records.length} records` : ""})`);
  }
  return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
