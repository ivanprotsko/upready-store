// Counts of the migrated tenant on the TARGET database, number next to SQL (rule 18b) — the same
// quantities 00-source-measure.json holds for the source, scoped through the tenant link tables.
//   node measure-target.mjs --db postgres://…/upready_store_cherkashina --tenant ten_… --out 03-target-measure.json
import { writeFileSync, readdirSync } from "node:fs";
import { cliDie, cliHelp } from "./lib/cli.mjs";
import { PSQL_DEFAULT, makePsql, stamp } from "./lib/psql.mjs";

const USAGE = `
measure-target.mjs — the same counts on the TARGET database, scoped to one tenant through its link tables.

  node measure-target.mjs --db <postgres url> --tenant <ten_…> --out <file.json> [--static-dir <dir>] [--psql-bin <path>]

  --db          connection string of the TARGET database (required)
  --tenant      tenant id to scope every count to (required)
  --out         file the measurements are written to (required)
  --static-dir  backend static root, to count the tenant's uploaded files on disk
  --psql-bin    psql to run; default \`${PSQL_DEFAULT}\` (env PSQL_BIN)

Writes: --out. Reads: the target database (SELECT) and, with --static-dir, that directory.

  node measure-target.mjs --db postgres://ivanprotsko@127.0.0.1:5433/upready_store_cherkashina \\
       --tenant ten_01M29Q4KYQHC70JZBENWZ8Z88M --out /tmp/03-target-measure.json --static-dir apps/backend/static
`;

const args = process.argv.slice(2);
cliHelp(args, USAGE);
const opt = (n, d) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : d);
const db = opt("--db", null);
const tenant = opt("--tenant", null);
const out = opt("--out", null);
const staticDir = opt("--static-dir", null);
if (!db || !tenant || !out) {
  cliDie(USAGE, "required: --db --tenant --out");
}
const q = makePsql({ command: opt("--psql-bin", PSQL_DEFAULT), args: [db] });
const TP = "tenant_tenant_product_product";
const TC = "tenant_tenant_product_product_category";
const M = [
  ["products", `select count(*)::int as n from ${TP} tp join product p on p.id = tp.product_id where tp.tenant_id = '${tenant}' and p.deleted_at is null`],
  ["products_by_status", `select p.status, count(*)::int as n from ${TP} tp join product p on p.id = tp.product_id where tp.tenant_id = '${tenant}' and p.deleted_at is null group by p.status order by p.status`],
  ["variants", `select count(*)::int as n from ${TP} tp join product_variant v on v.product_id = tp.product_id where tp.tenant_id = '${tenant}' and v.deleted_at is null`],
  ["categories", `select count(*)::int as n from ${TC} where tenant_id = '${tenant}'`],
  ["category_links", `select count(*)::int as n from ${TP} tp join product_category_product cp on cp.product_id = tp.product_id where tp.tenant_id = '${tenant}'`],
  ["images", `select count(*)::int as n from ${TP} tp join image i on i.product_id = tp.product_id where tp.tenant_id = '${tenant}' and i.deleted_at is null`],
  ["thumbnails", `select count(*)::int as n from ${TP} tp join product p on p.id = tp.product_id where tp.tenant_id = '${tenant}' and p.deleted_at is null and p.thumbnail is not null`],
  ["prices_by_currency", `select pr.currency_code, count(*)::int as n from ${TP} tp join product_variant v on v.product_id = tp.product_id join product_variant_price_set vps on vps.variant_id = v.id join price pr on pr.price_set_id = vps.price_set_id and pr.deleted_at is null where tp.tenant_id = '${tenant}' and v.deleted_at is null group by pr.currency_code order by pr.currency_code`],
  ["product_translations", `select count(*)::int as n from translation t join ${TP} tp on tp.product_id = t.reference_id where tp.tenant_id = '${tenant}' and t.reference = 'product'`],
  ["pages", `select locale, count(*)::int as n from tenant_page where tenant_id = '${tenant}' and deleted_at is null group by locale order by locale`],
  ["home", `select count(*)::int as n from tenant_home_config where tenant_id = '${tenant}'`],
  ["domains", `select count(*)::int as n from tenant_domain where tenant_id = '${tenant}'`],
];
const result = { measured_at: stamp(), target: db, tenant_id: tenant, measures: {} };
for (const [name, sql] of M) {
  try {
    const rows = q(sql);
    const value = rows.length === 1 && "n" in rows[0] && Object.keys(rows[0]).length === 1 ? rows[0].n : rows.map((r) => Object.values(r).join(" ")).join(", ");
    result.measures[name] = { sql, value };
  } catch (e) {
    result.measures[name] = { sql, error: String(e.stderr ?? e.message).trim().split("\n")[0] };
  }
}
if (staticDir) {
  const dir = `${staticDir}/tenants/${tenant}`;
  let n = 0;
  try {
    n = readdirSync(dir).length;
  } catch {
    n = 0;
  }
  result.measures.files_on_disk = { sql: `readdirSync(${dir}).length`, value: n };
}
writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(`${result.measured_at} → ${out}`);
for (const [k, m] of Object.entries(result.measures)) console.log(`${k.padEnd(22)} ${m.value ?? m.error}`);
