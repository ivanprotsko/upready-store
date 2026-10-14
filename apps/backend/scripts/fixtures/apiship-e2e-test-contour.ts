/**
 * apiship-e2e-test-contour.ts — the end-to-end run of the ApiShip client on
 * ApiShip's TEST contour (t-2026-10-14-58, acceptance 2), through the same
 * functions the fulfillment provider calls, with no database and no Medusa.
 *
 * For each carrier the public test account has connected (СДЭК; Почта России
 * is not connected there, measured 14.10.2026): register a shipment, wait for
 * the carrier to accept it, fetch the label and the act, read the statuses,
 * cancel and delete. Request and answer SHAPES are printed; the token never.
 *
 *   APISHIP_LOGIN=test APISHIP_PASSWORD=test APISHIP_BASE_URL=http://api.dev.apiship.ru/v1 \
 *     npx ts-node --transpile-only scripts/fixtures/apiship-e2e-test-contour.ts
 *
 * `APISHIP_TOKEN` may replace the login pair. A fixture, outside the build
 * (`scripts/fixtures`, AGENTS.md); it writes only to ApiShip's test contour
 * and cleans up after itself.
 */
import {
  calculate,
  listConnections,
  listPoints,
  listTariffs,
  loginApiship,
  type ApishipCredentials,
} from "../../src/apiship/client";
import {
  cancelOrder,
  createOrder,
  deleteOrder,
  downloadDocument,
  getLabels,
  getOrderStatus,
  getOrderStatuses,
  getWaybills,
  listWebhooks,
} from "../../src/apiship/orders";
import { buildApishipOrderRequest } from "../../src/apiship/order-request";
import { emptyApishipCredentials } from "../../src/tenant-secrets/apiship";
import type { ApishipShippingMethodData } from "../../src/apiship/method";

const base = (process.env.APISHIP_BASE_URL ?? "http://api.dev.apiship.ru/v1").replace(/\/$/, "");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (line: string) => console.log(line);
const shape = (value: unknown): string =>
  (JSON.stringify(value ?? null, (key, inner) => (key.toLowerCase().includes("token") ? "<hidden>" : inner)) ?? "null").slice(0, 700);

const main = async () => {
  let token = process.env.APISHIP_TOKEN ?? "";
  if (!token) {
    const login = process.env.APISHIP_LOGIN ?? "";
    const password = process.env.APISHIP_PASSWORD ?? "";
    if (!login || !password) {
      console.error("set APISHIP_TOKEN, or APISHIP_LOGIN and APISHIP_PASSWORD");
      process.exit(2);
    }
    token = await loginApiship({ login, password, base });
    log(`login: ok (token length ${token.length}, kept in memory)`);
  }
  const credentials: ApishipCredentials = { token, base };

  const connections = await listConnections(credentials);
  log(`connections: ${connections.length} → ${connections.map((c) => `${c.providerKey}#${c.id}${c.test ? " test" : ""}`).join(", ")}`);
  const wanted = ["cdek", "rupost"];
  const results: Record<string, unknown> = {};

  for (const providerKey of wanted) {
    const mine = connections.filter((c) => c.providerKey === providerKey);
    if (!mine.length) {
      log(`\n== ${providerKey}: NOT connected on this account — skipped (connect it in the cabinet to run this part)`);
      results[providerKey] = { connected: false };
      continue;
    }
    // Prefer the connection marked test; the other СДЭК connection of the public account fails to upload (invalid_client).
    const connection = mine.find((c) => c.test) ?? mine[0];
    log(`\n== ${providerKey}: connection #${connection.id}`);

    const tariffs = await listTariffs(credentials, { providerKey });
    log(`tariffs: ${tariffs.length}; first door-door: ${shape(tariffs.find((t) => t.pickupType === 1 && t.deliveryType === 1))}`);
    const points = await listPoints(credentials, { providerKey, city: "Санкт-Петербург", limit: 3 });
    log(`points in Санкт-Петербург: total ${points.total}; first: ${shape(points.points[0])}`);

    const calc = await calculate(credentials, {
      from: { countryCode: "RU", city: "Москва", index: "101000" },
      to: { countryCode: "RU", city: "Санкт-Петербург", index: "190000" },
      places: [{ weight: 1000, length: 30, width: 20, height: 10 }],
      providerKeys: [providerKey],
      assessedCost: 1000,
      timeout: 20000,
    });
    log(`calculator: door ${calc.deliveryToDoor.map((g) => `${g.providerKey}:${g.tariffs.length}`).join(",") || "-"}; point ${calc.deliveryToPoint.map((g) => `${g.providerKey}:${g.tariffs.length}`).join(",") || "-"}`);

    // The calculator's tariff when it answers; else the carrier's everyday
    // parcel tariff of the right types, the way the provider's fallback picks it.
    const fitting = tariffs.filter((t) => (t.pickupType ?? 1) === 1 && (t.deliveryType ?? 1) === 1);
    const doorTariff =
      calc.deliveryToDoor.find((g) => g.providerKey === providerKey)?.tariffs[0]?.tariffId ??
      (fitting.find((t) => /посылка/i.test(`${t.aliasName ?? ""} ${t.name}`)) ?? fitting[0])?.id;
    log(`tariff chosen: ${doorTariff} (${tariffs.find((t) => t.id === doorTariff)?.name ?? "?"})`);
    if (!doorTariff) {
      log("no door-to-door tariff: skipped");
      results[providerKey] = { connected: true, tariff: null };
      continue;
    }

    const methodData: ApishipShippingMethodData = {
      provider: "apiship",
      tenant_id: "e2e",
      provider_key: providerKey,
      kind: "courier",
      apiship_connection_id: connection.id,
      apiship_point_id: null,
      apiship_point_code: null,
      apiship_point_name: null,
      apiship_point_address: null,
      tariff_id: doorTariff,
      tariff_name: null,
      period_min: null,
      period_max: null,
      term_label: null,
      carrier_amount: 0,
      weight_g: null,
      default_weight_g: 500,
    };
    const sender = {
      ...emptyApishipCredentials(),
      token,
      sender_name: "Отправитель Тест",
      sender_company: "Тест",
      sender_phone: "79250001115",
      sender_email: "sender@example.com",
      sender_region: "Москва",
      sender_city: "Москва",
      sender_address: "г Москва, ул Машкова, д 21",
      sender_index: "105062",
    };
    const order = {
      display_id: `t58e2e-${Date.now().toString(36)}`,
      email: "buyer@example.com",
      shipping_address: {
        first_name: "Получатель",
        last_name: "Тест",
        phone: "+7 925 000-11-16",
        address_1: "Невский пр-кт, 1",
        city: "Санкт-Петербург",
        province: "г Санкт-Петербург",
        postal_code: "191186",
        country_code: "ru",
      },
      items: [{ id: "li_1", product_title: "Плед", variant_title: "Серый", variant_sku: "PLED-1", unit_price: 1000, variant: { weight: 1000 } }],
    };
    const built = buildApishipOrderRequest({
      methodData,
      credentials: sender,
      tariffId: doorTariff,
      clientNumber: order.display_id,
      order,
      items: [{ line_item_id: "li_1", quantity: 1, title: "Серый", sku: "PLED-1" }],
      point: null,
      connectionId: connection.id,
    });
    if ("missing" in built) {
      log(`order request incomplete: ${built.missing}`);
      continue;
    }
    log(`POST /orders request: ${shape(built.request)}`);
    const ack = await createOrder(credentials, built.request);
    log(`POST /orders answer: ${shape(ack)}`);

    let status = await getOrderStatus(credentials, ack.orderId);
    const started = Date.now();
    while (!status.orderInfo.providerNumber && !["uploaded", "uploadingError"].includes(status.status.key) && Date.now() - started < 120_000) {
      await sleep(10_000);
      status = await getOrderStatus(credentials, ack.orderId);
      log(`  t+${Math.round((Date.now() - started) / 1000)}s status ${status.status.key}, providerNumber ${JSON.stringify(status.orderInfo.providerNumber ?? "")}`);
    }
    log(`GET /orders/{id}/status answer: ${shape(status)}`);

    const labels = await getLabels(credentials, [ack.orderId]);
    log(`POST /orders/labels answer: ${shape(labels)}`);
    if (labels.url) {
      const file = await downloadDocument(credentials, labels.url);
      log(`label file: ${file.contentType}, ${file.bytes.length} bytes, head ${JSON.stringify(file.bytes.subarray(0, 5).toString("latin1"))}`);
    }
    const waybills = await getWaybills(credentials, [ack.orderId]);
    log(`POST /orders/waybills answer: ${shape(waybills)}`);
    if (waybills.waybills[0]) {
      const file = await downloadDocument(credentials, waybills.waybills[0].file);
      log(`act file: ${file.contentType}, ${file.bytes.length} bytes, head ${JSON.stringify(file.bytes.subarray(0, 5).toString("latin1"))}`);
    }
    const batch = await getOrderStatuses(credentials, [ack.orderId, 1]);
    log(`POST /orders/statuses answer: ${shape(batch)}`);

    const canceled = await cancelOrder(credentials, ack.orderId);
    log(`GET /orders/{id}/cancel answer: ${shape(canceled)}`);
    const deleted = await deleteOrder(credentials, ack.orderId);
    log(`DELETE /orders/{id} answer: ${shape(deleted)}`);

    results[providerKey] = {
      connected: true,
      orderId: ack.orderId,
      status: status.status.key,
      providerNumber: status.orderInfo.providerNumber || null,
      label: Boolean(labels.url),
      act: waybills.waybills.length,
      canceled: Boolean(canceled.canceled),
      deleted: Boolean(deleted.deleted),
    };
  }

  const hooks = await listWebhooks(credentials);
  log(`\nwebhooks on the account: ${hooks.length}`);
  log(`\nSUMMARY ${JSON.stringify(results)}`);
};

main().catch((error) => {
  console.error(`e2e failed: ${(error as Error).message}`);
  process.exit(1);
});
