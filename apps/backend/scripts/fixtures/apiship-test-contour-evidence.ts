/**
 * apiship-test-contour-evidence.ts — the evidence run on ApiShip's TEST contour
 * (t-2026-10-14-58; Ivan 14.10 16:58: «покажи, как выглядят наклейки … расчёт
 * стоимости проверили?»). The same client functions the fulfillment provider
 * calls, with no database and no Medusa; the token is never printed.
 *
 * Writes into `out/t58-contour/` (gitignored, `**​/out/`; run-queue brings new
 * files of the worktree back from boat):
 *
 *   calculator.json, calculator.md — the calculator's answers for three
 *     destinations × СДЭК pickup point / СДЭК courier / Почта России;
 *   apiship-<carrier>-label.pdf, apiship-<carrier>-act.pdf — the carrier's own
 *     documents for a shipment registered through ApiShip;
 *   lifecycle.json — create, status + track, cancel: one record each.
 *
 *   CONTOUR_KEYS_FILE=scripts/fixtures/contour-keys.local.txt \
 *     npx ts-node --transpile-only scripts/fixtures/apiship-test-contour-evidence.ts
 *
 * The account (`APISHIP_LOGIN` and `APISHIP_PASSWORD`, or `APISHIP_TOKEN`) comes
 * from the environment or from the keys file the command names: `NAME=value`
 * lines, untracked, never committed. A credential value never stands in a
 * command text (run-queue refuses such a ticket since 14.10). `APISHIP_BASE_URL`
 * defaults to the test contour. The shipments it registers are cancelled and
 * deleted at the end.
 */
import fs from "node:fs";
import path from "node:path";

import {
  calculate,
  listConnections,
  listTariffs,
  loginApiship,
  type ApishipCalculatorAddress,
  type ApishipCalculatorAnswer,
  type ApishipCalculatorTariff,
  type ApishipCredentials,
} from "../../src/apiship/client";
import {
  cancelOrder,
  createOrder,
  deleteOrder,
  downloadDocument,
  getLabels,
  getOrderStatus,
  getWaybills,
} from "../../src/apiship/orders";
import { buildApishipOrderRequest } from "../../src/apiship/order-request";
import { emptyApishipCredentials } from "../../src/tenant-secrets/apiship";
import type { ApishipShippingMethodData } from "../../src/apiship/method";

const base = (process.env.APISHIP_BASE_URL ?? "http://api.dev.apiship.ru/v1").replace(/\/$/, "");
const OUT = path.resolve(__dirname, "../../out/t58-contour");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (line: string) => console.log(line);
const shape = (value: unknown): string =>
  (JSON.stringify(value ?? null, (key, inner) => (key.toLowerCase().includes("token") ? "<hidden>" : inner)) ?? "null").slice(0, 700);
const save = (name: string, bytes: Buffer | string) => {
  fs.writeFileSync(path.join(OUT, name), bytes);
  log(`saved ${name} (${Buffer.byteLength(bytes)} bytes)`);
};

/** The shop's sender address of the fixture (Москва, ул Машкова, 21). */
const FROM: ApishipCalculatorAddress = { countryCode: "RU", city: "Москва", index: "105062" };

/** Three destinations Ivan named: the capital, a million-city, a village. */
const DESTINATIONS: Array<{ label: string; to: ApishipCalculatorAddress }> = [
  { label: "Москва", to: { countryCode: "RU", city: "Москва", index: "101000" } },
  { label: "Новосибирск", to: { countryCode: "RU", city: "Новосибирск", index: "630000" } },
  {
    label: "село Новая Усмань, Воронежская обл.",
    to: { countryCode: "RU", region: "Воронежская", city: "Новая Усмань", index: "396310" },
  },
];

const PLACE = { weight: 1000, length: 30, width: 20, height: 10 };

/**
 * The test contour's calculator is slow (a filtered call for Москва and an
 * unfiltered one for Новосибирск ran past the client's default on 14.10):
 * these calls may take a minute and a half.
 */
const CALCULATOR_OPTIONS = { timeoutMs: 90_000 };

type Cell = {
  tariffId: number;
  tariffName: string;
  deliveryCost: number;
  daysMin: number | null;
  daysMax: number | null;
  offers: number;
} | null;

const cheapest = (groups: ApishipCalculatorAnswer["deliveryToDoor"], providerKey: string): Cell => {
  const tariffs: ApishipCalculatorTariff[] = groups.filter((g) => g.providerKey === providerKey).flatMap((g) => g.tariffs);
  if (!tariffs.length) return null;
  const best = [...tariffs].sort((a, b) => a.deliveryCost - b.deliveryCost)[0];
  return {
    tariffId: best.tariffId,
    tariffName: best.tariffName,
    deliveryCost: best.deliveryCost,
    daysMin: best.daysMin,
    daysMax: best.daysMax,
    offers: tariffs.length,
  };
};

const cellText = (cell: Cell, note: string | null): string => {
  if (note) return `ошибка: ${note}`;
  if (!cell) return "— (пусто)";
  const days =
    cell.daysMin != null || cell.daysMax != null
      ? `, ${cell.daysMin ?? "?"}–${cell.daysMax ?? "?"} дн`
      : "";
  return `${cell.deliveryCost} ₽ — ${cell.tariffName} (#${cell.tariffId})${days}${cell.offers > 1 ? `, предложений ${cell.offers}` : ""}`;
};

const runCalculator = async (credentials: ApishipCredentials) => {
  const rows: Array<Record<string, unknown>> = [];
  const lines: string[] = [
    `# Калькулятор ApiShip, тестовый контур ${base}`,
    "",
    `Откуда: ${FROM.city} ${FROM.index}. Место: ${PLACE.weight} г, ${PLACE.length}×${PLACE.width}×${PLACE.height} см, оценочная стоимость 1000 ₽. В ячейке — самый дешёвый тариф перевозчика.`,
    "",
    "| Куда | СДЭК ПВЗ | СДЭК курьер | Почта России | Что отдал контур без фильтра перевозчиков |",
    "|---|---|---|---|---|",
  ];

  for (const destination of DESTINATIONS) {
    const request = { from: FROM, to: destination.to, places: [PLACE], assessedCost: 1000, timeout: 20000 };
    let answer: ApishipCalculatorAnswer | null = null;
    let note: string | null = null;
    try {
      answer = await calculate(credentials, { ...request, providerKeys: ["cdek", "rupost"] }, CALCULATOR_OPTIONS);
    } catch (error) {
      note = (error as Error).message.slice(0, 160);
    }
    let all: ApishipCalculatorAnswer | null = null;
    let allNote: string | null = null;
    try {
      all = await calculate(credentials, request, CALCULATOR_OPTIONS);
    } catch (error) {
      allNote = (error as Error).message.slice(0, 160);
    }
    const summary = (groups: ApishipCalculatorAnswer["deliveryToDoor"]) =>
      groups.map((g) => `${g.providerKey}:${g.tariffs.length}`).join(", ") || "-";
    const allText = allNote
      ? `ошибка: ${allNote}`
      : all
        ? `до двери ${summary(all.deliveryToDoor)}; до пункта ${summary(all.deliveryToPoint)}`
        : "-";

    // The contour cut the filtered call for Москва twice on 14.10 («terminated»)
    // while the unfiltered one answered: the cells then come from the full answer.
    const source = answer ?? all;
    if (!answer && all) note = null;
    const cells = {
      cdek_pickup: source ? cheapest(source.deliveryToPoint, "cdek") : null,
      cdek_courier: source ? cheapest(source.deliveryToDoor, "cdek") : null,
      rupost_door: source ? cheapest(source.deliveryToDoor, "rupost") : null,
      rupost_point: source ? cheapest(source.deliveryToPoint, "rupost") : null,
    };
    const rupost = cells.rupost_door ?? cells.rupost_point;
    log(`calculator → ${destination.label}: cdek pickup ${cellText(cells.cdek_pickup, note)}; cdek courier ${cellText(cells.cdek_courier, note)}; rupost ${cellText(rupost, note)}; all: ${allText}`);
    rows.push({ destination: destination.label, to: destination.to, cells, note, all, allNote, raw: answer });
    lines.push(
      `| ${destination.label} | ${cellText(cells.cdek_pickup, note)} | ${cellText(cells.cdek_courier, note)} | ${cellText(rupost, note)}${rupost && cells.rupost_door == null ? " (до пункта)" : ""} | ${allText} |`,
    );
  }

  lines.push("", `Снято ${new Date().toISOString()}.`);
  save("calculator.json", JSON.stringify({ base, from: FROM, place: PLACE, rows }, null, 2));
  save("calculator.md", lines.join("\n") + "\n");
};

const runLifecycle = async (credentials: ApishipCredentials, token: string, providerKey: string) => {
  const connections = await listConnections(credentials);
  const mine = connections.filter((c) => c.providerKey === providerKey);
  if (!mine.length) {
    log(`\n== ${providerKey}: NOT connected on this account (connections: ${connections.map((c) => `${c.providerKey}#${c.id}`).join(", ")})`);
    return { connected: false, connections: connections.map((c) => ({ providerKey: c.providerKey, id: c.id, test: c.test })) };
  }
  const connection = mine.find((c) => c.test) ?? mine[0];
  log(`\n== ${providerKey}: connection #${connection.id}`);

  const tariffs = await listTariffs(credentials, { providerKey });
  const fitting = tariffs.filter((t) => (t.pickupType ?? 1) === 1 && (t.deliveryType ?? 1) === 1);
  const tariffId = (fitting.find((t) => /посылка/i.test(`${t.aliasName ?? ""} ${t.name}`)) ?? fitting[0])?.id;
  log(`tariffs: ${tariffs.length}; chosen door-door ${tariffId} (${tariffs.find((t) => t.id === tariffId)?.name ?? "?"})`);
  if (!tariffId) return { connected: true, tariff: null };

  const methodData: ApishipShippingMethodData = {
    provider: "apiship",
    tenant_id: "evidence",
    provider_key: providerKey,
    kind: "courier",
    apiship_connection_id: connection.id,
    apiship_point_id: null,
    apiship_point_code: null,
    apiship_point_name: null,
    apiship_point_address: null,
    tariff_id: tariffId,
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
    display_id: `t58ev-${Date.now().toString(36)}`,
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
    tariffId,
    clientNumber: order.display_id,
    order,
    items: [{ line_item_id: "li_1", quantity: 1, title: "Серый", sku: "PLED-1" }],
    point: null,
    connectionId: connection.id,
  });
  if ("missing" in built) {
    log(`order request incomplete: ${built.missing}`);
    return { connected: true, missing: built.missing };
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

  const files: Record<string, unknown> = {};
  const labels = await getLabels(credentials, [ack.orderId]);
  log(`POST /orders/labels answer: ${shape(labels)}`);
  if (labels.url) {
    const file = await downloadDocument(credentials, labels.url);
    files.label = { contentType: file.contentType, bytes: file.bytes.length, pdf: file.bytes.subarray(0, 5).toString("latin1") === "%PDF-" };
    save(`apiship-${providerKey}-label.pdf`, file.bytes);
  }
  const waybills = await getWaybills(credentials, [ack.orderId]);
  log(`POST /orders/waybills answer: ${shape(waybills)}`);
  if (waybills.waybills[0]) {
    const file = await downloadDocument(credentials, waybills.waybills[0].file);
    files.act = { contentType: file.contentType, bytes: file.bytes.length, pdf: file.bytes.subarray(0, 5).toString("latin1") === "%PDF-" };
    save(`apiship-${providerKey}-act.pdf`, file.bytes);
  }

  const canceled = await cancelOrder(credentials, ack.orderId);
  log(`GET /orders/{id}/cancel answer: ${shape(canceled)}`);
  const deleted = await deleteOrder(credentials, ack.orderId);
  log(`DELETE /orders/{id} answer: ${shape(deleted)}`);

  return {
    connected: true,
    connectionId: connection.id,
    create: { request: built.request, answer: ack },
    status: {
      key: status.status.key,
      name: status.status.name ?? null,
      providerNumber: status.orderInfo.providerNumber ?? null,
      trackingUrl: status.orderInfo.trackingUrl ?? null,
      waitedSeconds: Math.round((Date.now() - started) / 1000),
    },
    files,
    cancel: canceled,
    delete: deleted,
  };
};

/**
 * The account comes from a local file the command only names (COO, 14.10:
 * credential values never stand in a command text, where `run-queue list`
 * shows them to everyone). `NAME=value` lines, a `#` comment dropped; a value
 * already in the environment wins. The file is untracked and never committed.
 */
const loadLocalKeys = (file = process.env.CONTOUR_KEYS_FILE ?? path.resolve(__dirname, "contour-keys.local.txt")) => {
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    const eq = line.indexOf("=");
    if (!line || line.startsWith("#") || eq < 1) continue;
    const name = line.slice(0, eq).trim();
    if (!process.env[name]) process.env[name] = line.slice(eq + 1).trim();
  }
};

const main = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  loadLocalKeys();
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

  await runCalculator(credentials);
  // `EVIDENCE_ONLY=calculator` re-takes the price table without registering a shipment.
  if (process.env.EVIDENCE_ONLY === "calculator") return;

  const lifecycle: Record<string, unknown> = {};
  for (const providerKey of ["cdek", "rupost"]) {
    try {
      lifecycle[providerKey] = await runLifecycle(credentials, token, providerKey);
    } catch (error) {
      log(`${providerKey}: failed — ${(error as Error).message}`);
      lifecycle[providerKey] = { failed: (error as Error).message };
    }
  }
  save("lifecycle.json", JSON.stringify({ base, at: new Date().toISOString(), lifecycle }, null, 2));
  log(`\nSUMMARY ${JSON.stringify(
    Object.fromEntries(
      Object.entries(lifecycle).map(([key, value]) => {
        const v = value as Record<string, unknown>;
        return [key, { connected: v.connected, status: (v.status as Record<string, unknown> | undefined)?.key, files: Object.keys((v.files as object) ?? {}), failed: v.failed ?? v.missing }];
      }),
    ),
  )}`);
};

main().catch((error) => {
  console.error(`evidence run failed: ${(error as Error).message}`);
  process.exit(1);
});
