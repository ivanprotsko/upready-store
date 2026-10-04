// Unit tests for deploy/scripts/order-smoke.mjs (t-2026-10-04-23, rule 5ze item 5). No network:
// only the pure pieces the run is built from — argument parsing, option choice, the address and
// the total check that fails a course-only cart carrying a shipping charge.
//
//   node --test deploy/scripts/__tests__/order-smoke.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SHAPES,
  UsageError,
  addressFor,
  blankAddressFor,
  checkTotals,
  chooseCourier,
  chooseDigital,
  chooseRegions,
  isDigitalProduct,
  main,
  parseArgs,
} from "../order-smoke.mjs";

test("the matrix holds every cart shape of rule 5ze item 1", () => {
  assert.deepEqual(SHAPES, [
    "physical_only",
    "course_only",
    "mixed",
    "physical_removed",
    "quantity_change",
    "region_change",
  ]);
});

test("parseArgs: --stand names the local stand, there is no default live target", () => {
  const stand = parseArgs(["--stand", "--dry-run"]);
  assert.equal(stand.api, "http://localhost:9700");
  assert.equal(stand.host, "cherkashino-ru.localhost");
  assert.equal(stand.dryRun, true);
  assert.throws(() => parseArgs([]), UsageError);
  assert.throws(() => parseArgs(["--api", "https://api.example.com"]), UsageError);
});

test("parseArgs: --only takes known shapes and refuses others", () => {
  assert.deepEqual(parseArgs(["--stand", "--only", "course_only,physical_removed"]).only, [
    "course_only",
    "physical_removed",
  ]);
  assert.throws(() => parseArgs(["--stand", "--only", "teleport"]), /unknown shape/);
  assert.throws(() => parseArgs(["--stand", "--bogus"]), /unknown argument/);
});

test("main places nothing without an admin token to cancel with", async () => {
  const saved = process.env.ORDER_SMOKE_ADMIN_TOKEN;
  delete process.env.ORDER_SMOKE_ADMIN_TOKEN;
  const errors = [];
  const original = console.error;
  console.error = (line) => errors.push(line);
  try {
    assert.equal(await main(["--api", "http://127.0.0.1:9", "--host", "shop.test"]), 2);
  } finally {
    console.error = original;
    if (saved !== undefined) process.env.ORDER_SMOKE_ADMIN_TOKEN = saved;
  }
  assert.match(errors.join("\n"), /ORDER_SMOKE_ADMIN_TOKEN/);
});

const pickup = { id: "so_pickup", price_type: "flat", amount: 0, service_zone: { fulfillment_set: { type: "pickup" } } };
const digital = { id: "so_digital", price_type: "flat", amount: 0, metadata: { digital_delivery: "true" } };
const dhl = { id: "so_dhl", price_type: "flat", amount: 3500, service_zone: { fulfillment_set: { type: "shipping" } } };
const quote = { id: "so_quote", price_type: "calculated", service_zone: { fulfillment_set: { type: "shipping" } } };

test("chooseCourier takes a paid flat courier, never pickup or digital", () => {
  assert.equal(chooseCourier([pickup, digital, quote, dhl]).id, "so_dhl");
  assert.equal(chooseCourier([pickup, digital, quote]).id, "so_quote");
  assert.equal(chooseCourier([pickup, digital]), null);
  assert.equal(chooseCourier([pickup, dhl], "so_pickup").id, "so_pickup");
});

test("chooseDigital finds the ₽0 digital-delivery option by its marker", () => {
  assert.equal(chooseDigital([dhl, digital]).id, "so_digital");
  assert.equal(chooseDigital([dhl]), null);
});

test("addressFor gives a Russian address a region; the digital address is blank", () => {
  assert.equal(addressFor("ru").province, "г Москва");
  assert.equal(addressFor("de").province, "");
  assert.equal(blankAddressFor("ru").city, "");
  assert.equal(blankAddressFor("ru").country_code, "ru");
});

test("checkTotals fails the stand cart: a course with DHL 3 500 ₽", () => {
  const cart = {
    total: 22400,
    item_total: 18900,
    shipping_total: 3500,
    discount_total: 0,
    shipping_methods: [{ id: "casm_dhl", name: "DHL", amount: 3500 }],
  };
  const problems = checkTotals(cart, { digital: true });
  assert.equal(problems.length, 2);
  assert.match(problems.join(" "), /shipping_total 3500/);
  assert.match(problems.join(" "), /DHL/);
});

test("checkTotals passes a course with the ₽0 digital method and a physical cart with shipping", () => {
  assert.deepEqual(
    checkTotals(
      { total: 18900, item_total: 18900, shipping_total: 0, discount_total: 0, shipping_methods: [{ amount: 0 }] },
      { digital: true },
    ),
    [],
  );
  assert.deepEqual(
    checkTotals(
      { total: 5500, item_total: 2000, shipping_total: 3500, discount_total: 0, shipping_methods: [{ amount: 3500 }] },
      { digital: false },
    ),
    [],
  );
});

test("checkTotals fails a shipping cart with no method and a total that does not add up", () => {
  assert.match(
    checkTotals({ total: 2000, item_total: 2000, shipping_total: 0, shipping_methods: [] }, { digital: false }).join(" "),
    /no shipping method/,
  );
  assert.match(
    checkTotals(
      { total: 9999, item_total: 2000, shipping_total: 3500, discount_total: 0, shipping_methods: [{ amount: 3500 }] },
      { digital: false },
    ).join(" "),
    /total 9999/,
  );
});

test("isDigitalProduct: the o24 marker, or no shipping profile where profiles are visible", () => {
  assert.equal(isDigitalProduct({ metadata: { digital: "true" }, shipping_profile: { id: "sp_1" } }, true), true);
  assert.equal(isDigitalProduct({ metadata: null }, true), true);
  assert.equal(isDigitalProduct({ metadata: null }, false), false);
  assert.equal(isDigitalProduct({ metadata: null, shipping_profile: { id: "sp_1" } }, true), false);
});

test("chooseRegions opens in the ru region and switches to de, or as told", () => {
  const regions = [
    { id: "reg_ad", name: "Andorra", countries: [{ iso_2: "ad" }] },
    { id: "reg_de", name: "Germany", countries: [{ iso_2: "de" }] },
    { id: "reg_ru", name: "Russia", countries: [{ iso_2: "ru" }] },
  ];
  const auto = chooseRegions(regions);
  assert.equal(auto.region.id, "reg_ru");
  assert.equal(auto.region.countries[0].iso_2, "ru");
  assert.equal(auto.otherRegion.id, "reg_de");
  const told = chooseRegions(regions, { country: "de", otherCountry: "ad" });
  assert.equal(told.region.id, "reg_de");
  assert.equal(told.otherRegion.id, "reg_ad");
  assert.equal(chooseRegions([regions[2]]).otherRegion, null);
  assert.equal(chooseRegions(regions, { country: "zz" }).region, null);
});
