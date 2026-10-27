/**
 * The command map: 121 chrxnasdmds commands, each with a target in this repo
 * or a reason it has none; the palette search; and the command tool, where a
 * read runs, a write only proposes and a confirm sends nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { HttpShopApi, type FetchFn } from "../shop/api.ts";
import { fixtureFetch } from "../shop/fixtures.ts";
import { readConfig } from "../config.ts";
import { RulesProvider } from "../model/rules.ts";
import type { ToolContext } from "../tools.ts";
import { COMMANDS, commandForPhrase, commandsCsv, fillPath, searchCommands } from "./index.ts";
import { confirmProposal, PROPOSAL_TTL_MS, ProposalStore, runCommand } from "./run.ts";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));

test("the map holds all 121 commands, ids unique", () => {
  assert.equal(COMMANDS.length, 121);
  assert.equal(new Set(COMMANDS.map((c) => c.id)).size, 121);
});

test("every command has a route or page in this repo at file:line, or missing with a reason", () => {
  for (const c of COMMANDS) {
    const t = c.target;
    if (t.kind === "missing") {
      assert.ok(t.reason.trim().length > 5, `${c.id}: missing needs a reason`);
      continue;
    }
    const file = `${REPO}${t.file}`;
    assert.ok(existsSync(file), `${c.id}: ${t.file} exists`);
    const lines = readFileSync(file, "utf8").split("\n");
    assert.ok(t.line >= 1 && t.line <= lines.length, `${c.id}: line ${t.line} is in ${t.file}`);
    if (t.kind === "route") {
      assert.match(t.path, /^\/tenants\//, `${c.id}: a route is a /tenants/* path`);
      // The line is the handler of the method: `export const GET` / `POST` / `DELETE`.
      assert.match(lines[t.line - 1]!, new RegExp(`export (const|async function) ${t.method}\\b`), `${c.id}: ${t.file}:${t.line} is ${t.method}`);
    } else {
      // Panel routes nest, so the line names the page's last fixed segment: «options/manage», «stock», «customers».
      const last = t.path.split("/").filter((s) => s && !s.startsWith("{")).at(-1)!;
      assert.ok(lines.slice(Math.max(0, t.line - 3), t.line + 2).join("\n").includes(last), `${c.id}: page ${t.path} at ${t.file}:${t.line}`);
    }
  }
});

test("the counts the report quotes: route 38, page 18, missing 65", () => {
  const count = (kind: string) => COMMANDS.filter((c) => c.target.kind === kind).length;
  assert.deepEqual([count("route"), count("page"), count("missing")], [38, 18, 65]);
});

test("destructive and financial commands are never given to the agent", () => {
  for (const c of COMMANDS.filter((x) => x.risk === "destructive" || x.risk === "financial")) assert.equal(c.agent, "none", c.id);
  for (const c of COMMANDS.filter((x) => x.agent === "read")) {
    assert.equal(c.target.kind, "route", c.id);
    assert.equal(c.target.kind === "route" && c.target.method, "GET", `${c.id}: a read is a GET`);
  }
  for (const c of COMMANDS.filter((x) => x.agent === "propose")) assert.ok(c.target.kind === "route" && c.target.method !== "GET", `${c.id}: a proposal is a write`);
  for (const c of COMMANDS.filter((x) => x.agent === "goto")) assert.ok(c.panel, `${c.id}: a goto has a panel page`);
});

test("commands.csv: a header and 121 rows", () => {
  const lines = commandsCsv().trim().split("\n");
  assert.equal(lines.length, 122);
  assert.match(lines[0]!, /^id,/);
});

test("palette search: Russian, English, an alias, an inflected word", () => {
  assert.equal(searchCommands("список акций")[0]?.id, "promotions.list");
  assert.equal(searchCommands("promotions")[0]?.section, "promotions");
  assert.ok(searchCommands("возвраты").some((c) => c.id === "returns.list"));
  assert.ok(searchCommands("заказов").some((c) => c.id === "orders.list"));
  assert.ok(searchCommands("снять с публикации").some((c) => c.id === "products.update"));
  assert.deepEqual(searchCommands("абракадабра"), []);
  assert.equal(searchCommands("").length, 121);
});

test("fillPath encodes and refuses a missing parameter", () => {
  assert.equal(fillPath("/tenants/orders/{id}", { id: "a/b" }), "/tenants/orders/a%2Fb");
  assert.equal(fillPath("/tenants/orders/{id}", {}), null);
});

/** The fixture shop behind a stub that records every request. */
function recordingCtx() {
  const seen: { method: string; url: string }[] = [];
  const fixtures = fixtureFetch();
  const net: FetchFn = async (input, init) => {
    seen.push({ method: (init?.method ?? "GET").toUpperCase(), url: String(input) });
    return fixtures(input, init);
  };
  const config = readConfig({ SHOP_API_URL: "https://shop.test", SHOP_LOGIN_EMAIL: "fixture", SHOP_LOGIN_PASSWORD: "fixture" });
  const shop = new HttpShopApi(config.shop, { store: net, owner: net });
  const proposals = new ProposalStore();
  const ctx: ToolContext = { shop, panelUrl: "https://panel.test", storefrontUrl: "https://store.test", locale: "ru", apiUrl: "https://shop.test", proposals };
  const nonGet = () => seen.filter((r) => r.method !== "GET" && !r.url.endsWith("/auth/tenant/emailpass"));
  return { ctx, seen, proposals, nonGet };
}

test("a read command runs on the shop and shows its result", async () => {
  const { ctx, seen } = recordingCtx();
  const out = await runCommand("promotions.list", {}, ctx);
  assert.match(out.text, /OSEN10/);
  assert.equal(out.card?.kind, "result");
  assert.ok(seen.some((r) => r.method === "GET" && r.url.startsWith("https://shop.test/tenants/promotions")));
});

test("every read command runs on fixtures with its id filled in, GET only", async () => {
  const { ctx, nonGet } = recordingCtx();
  for (const c of COMMANDS.filter((x) => x.agent === "read")) {
    const params = c.section === "promotions" ? { id: "promo_fixture_1" } : undefined;
    const out = await runCommand(c.id, { order: "1041", product: "тройчатка", params }, ctx);
    assert.ok(out.text && !/не удалось|ошибк/i.test(out.text), `${c.id}: ${out.text}`);
  }
  assert.deepEqual(nonGet(), []);
});

test("a write becomes a proposal; confirm shows the exact request and sends nothing", async () => {
  const { ctx, nonGet, proposals } = recordingCtx();
  const out = await runCommand("products.update", { product: "тройчатка", body: { status: "draft" } }, ctx);
  assert.equal(out.card?.kind, "proposal");
  assert.deepEqual(out.card?.request, {
    method: "POST",
    url: "https://shop.test/tenants/products/prod_01M2GRC9BG5GJG7CV5X0WKMNNC",
    body: { status: "draft" },
  });
  assert.deepEqual(nonGet(), [], "proposing sends nothing");

  const done = confirmProposal(proposals, out.card!.proposalId!);
  assert.equal(done?.sent, false);
  assert.equal(done?.dryRun, true);
  assert.deepEqual(done?.request, out.card?.request);
  assert.equal(done?.card.kind, "dryrun");
  assert.deepEqual(nonGet(), [], "confirming sends nothing either");
  assert.equal(confirmProposal(proposals, out.card!.proposalId!), null, "a proposal confirms once");
});

test("every propose command drafts without a single non-GET", async () => {
  const { ctx, nonGet } = recordingCtx();
  for (const c of COMMANDS.filter((x) => x.agent === "propose")) {
    const out = await runCommand(c.id, { order: "1041", product: "тройчатка", params: { id: "x1", fulfillment_id: "f1" } }, ctx);
    assert.ok(out.card?.kind === "proposal" || /не хватает/.test(out.text), `${c.id}: ${out.text}`);
  }
  assert.deepEqual(nonGet(), []);
});

test("not given to the agent: the reason and no request", async () => {
  const { ctx, seen } = recordingCtx();
  const refund = COMMANDS.find((c) => c.risk === "financial")!;
  const out = await runCommand(refund.id, {}, ctx);
  assert.equal(out.card?.request, undefined);
  assert.equal(seen.length, 0);
  assert.match((await runCommand("no.such", {}, ctx)).text, /нет/i);
});

test("a proposal expires after its time", () => {
  let now = 0;
  const store = new ProposalStore(() => now);
  const p = store.add(COMMANDS.find((c) => c.agent === "propose")!, { method: "POST", url: "https://shop.test/x", body: {} });
  now = PROPOSAL_TTL_MS + 1;
  assert.equal(store.take(p.id), null);
});

const READ_PHRASES: [string, string][] = [
  ["список акций", "promotions.list"],
  ["какие у нас скидки", "promotions.list"],
  ["покажи возвраты", "returns.list"],
  ["есть обмены?", "exchanges.list"],
  ["претензии", "claims.list"],
  ["покажи резервы", "reservations.list"],
  ["способы оплаты", "payment_methods.list"],
  ["какие способы доставки", "orders.shipping_options"],
  ["баннеры на главной", "home_banners.list"],
  ["все остатки", "inventory.list"],
  ["список товаров", "products.list"],
  ["открой заказ 1041", "orders.get"],
  ["состав заказа 1041", "orders.line_items"],
  ["история заказа 1041", "orders.changes"],
];

test("the rules router reaches 10+ read commands by a Russian phrase", async () => {
  const rules = new RulesProvider();
  const hit = new Set<string>();
  for (const [phrase, id] of READ_PHRASES) {
    assert.equal(commandForPhrase(phrase, ["read"])?.id, id, phrase);
    const step = await rules.next({ system: "", tools: [], messages: [{ role: "user", text: phrase }] });
    assert.equal(step.kind, "tools", phrase);
    const call = step.kind === "tools" ? step.calls[0] : undefined;
    assert.equal(call?.name, "run_command", phrase);
    assert.equal(call?.input.id, id, phrase);
    hit.add(id);
  }
  assert.ok(hit.size >= 10, `${hit.size} read commands`);
});

test("the rules router proposes a write and still refuses destructive ones", async () => {
  const rules = new RulesProvider();
  const step = await rules.next({ system: "", tools: [], messages: [{ role: "user", text: "сними с публикации тройчатку" }] });
  assert.equal(step.kind === "tools" && step.calls[0]?.input.id, "products.update");
  const refuse = await rules.next({ system: "", tools: [], messages: [{ role: "user", text: "удали заказ 1041" }] });
  assert.equal(refuse.kind, "text");
});
