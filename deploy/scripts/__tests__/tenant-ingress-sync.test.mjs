// Unit tests for deploy/scripts/tenant-ingress-sync.sh, the unknown-host router (t-2026-10-12-32 FX4, audit 13.10 D4)
// — no Docker, no database, no traefik. A stand-in `psql` on PATH answers the script's three queries; `--once` writes
// mt-tenants.yml into a temp folder, and the file is read as text.
//
// The defect: `nosuchshop-t32.shipshift.dev` and `beautyprojapan.shipshift.dev` answered traefik's bare 502
// "Bad Gateway" — `/healthz` included, which the storefront serves without asking anyone — because no router of ours
// matched them and a catch-all with a dead service did. The fix is one router per base domain that sends every
// one-label host under it to the storefront, at a priority above a priority-1 catch-all and below every real rule.
//
//   node --test deploy/scripts/__tests__/tenant-ingress-sync.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(here, "..", "tenant-ingress-sync.sh");

// What the stand-in database holds: one custom domain, two shops, no handle aliases.
const PSQL = `#!/bin/sh
case "$*" in
  *"from tenant_domain"*) echo "shop.example.com" ;;
  *"select handle from tenant where"*) printf 'acme\\ncherkashino\\n' ;;
  *"lower(id) from tenant"*) printf 'ten_01\\nten_02\\n' ;;
  *) : ;;
esac
`;

function sync(baseDomains) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ingress-sync-"));
  const bin = path.join(dir, "bin");
  spawnSync("mkdir", ["-p", bin]);
  writeFileSync(path.join(bin, "psql"), PSQL);
  chmodSync(path.join(bin, "psql"), 0o755);
  const out = path.join(dir, "dynamic");
  const run = spawnSync("sh", [SCRIPT, "--once"], {
    encoding: "utf8",
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      DATABASE_URL: "postgres://stand-in",
      TENANT_BASE_DOMAINS: baseDomains,
      TRAEFIK_DYNAMIC_DIR: out,
    },
  });
  assert.equal(run.status, 0, run.stderr);
  return readFileSync(path.join(out, "mt-tenants.yml"), "utf8");
}

/** The routers of the generated file, by name: the lines indented under each one, as key → raw value. */
function routers(yaml) {
  const lines = yaml.split("\n");
  const start = lines.indexOf("  routers:");
  const end = lines.indexOf("  middlewares:");
  const out = {};
  let current = null;
  for (const line of lines.slice(start + 1, end)) {
    const name = line.match(/^ {4}([\w-]+):$/);
    if (name) {
      current = out[name[1]] = {};
      continue;
    }
    const field = line.match(/^ {6}(\w+): (.*)$/);
    if (field && current) current[field[1]] = field[2];
  }
  return out;
}

/** The regex inside a `'HostRegexp(`…`)'` rule, as the single-quoted YAML scalar gives it to traefik. */
function hostRegexpOf(rule) {
  const m = rule.match(/^'HostRegexp\(`(.+)`\)'$/);
  assert.ok(m, `not a single-quoted HostRegexp rule: ${rule}`);
  return new RegExp(m[1]);
}

test("an unknown one-label host under the base domain is routed to the storefront, over https and http", () => {
  const r = routers(sync("shipshift.dev"));

  const https = r["mt-unknown-shipshift-dev"];
  assert.ok(https, "no unknown-host router for shipshift.dev");
  assert.equal(https.rule, "'HostRegexp(`^[a-z0-9-]+\\.shipshift\\.dev$`)'");
  assert.equal(https.service, "mt-storefront");
  assert.equal(https.entryPoints, '["https"]');
  assert.equal(https.tls, "{}", "the *.shipshift.dev certificate covers it, no resolver per unknown host");

  const http = r["mt-unknown-shipshift-dev-http"];
  assert.ok(http, "no http twin");
  assert.equal(http.rule, https.rule);
  assert.equal(http.middlewares, '["mt-to-https"]');
  assert.equal(http.service, "mt-storefront");

  const regex = hostRegexpOf(https.rule);
  for (const host of ["nosuchshop-t32.shipshift.dev", "beautyprojapan.shipshift.dev", "acme.shipshift.dev"]) {
    assert.ok(regex.test(host), `${host} should match`);
  }
  for (const host of ["shipshift.dev", "a.b.shipshift.dev", "nosuch.shipshift.dev.evil.test", "nosuch-shipshift.dev"]) {
    assert.ok(!regex.test(host), `${host} should not match`);
  }
});

test("its priority sits above a priority-1 catch-all and below every router with a real rule", () => {
  const r = routers(sync("shipshift.dev"));
  const priority = Number(r["mt-unknown-shipshift-dev"].priority);
  const catchAll = 1; // upready studio's HostRegexp(`^.+$`), deploy/mt/traefik-demo-hosts.yml
  assert.ok(priority > catchAll, `priority ${priority} must beat the catch-all's ${catchAll}`);

  // Traefik's default priority is the length of the rule. The exact shop routers carry none of their own, so
  // each one's priority is its rule's length, and the shortest Host() of any service is longer still than 2.
  const exact = Object.entries(r).filter(([, v]) => !v.priority);
  assert.ok(exact.length > 0);
  for (const [name, v] of exact) {
    const length = v.rule.replace(/^"|"$/g, "").length;
    assert.ok(length > priority, `${name}: default priority ${length} must outrank ${priority}`);
  }
  assert.ok("Host(`x.y`)".length > priority);
});

test("every shop keeps its own exact router next to the unknown-host one", () => {
  const r = routers(sync("shipshift.dev"));
  for (const host of ["acme.shipshift.dev", "cherkashino.shipshift.dev", "ten_01.shipshift.dev", "shop.example.com"]) {
    const slug = host.replace(/\./g, "-").replace(/[^a-z0-9-]/g, "");
    assert.equal(r[`mt-t-${slug}`]?.rule, `"Host(\`${host}\`)"`, host);
  }
});

test("one unknown-host pair per base domain, none without a base domain", () => {
  const two = routers(sync("shipshift.dev,cherkashino.ru"));
  assert.equal(two["mt-unknown-cherkashino-ru"].rule, "'HostRegexp(`^[a-z0-9-]+\\.cherkashino\\.ru$`)'");
  assert.ok(two["mt-unknown-cherkashino-ru-http"]);
  assert.ok(two["mt-unknown-shipshift-dev"]);

  const none = routers(sync(""));
  assert.deepEqual(Object.keys(none).filter((name) => name.startsWith("mt-unknown-")), []);
  assert.ok(none["mt-t-shop-example-com"], "custom domains are still published");
});
