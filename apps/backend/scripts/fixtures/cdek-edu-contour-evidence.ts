/**
 * cdek-edu-contour-evidence.ts — a parcel label and an order receipt from CDEK's
 * EDU contour (`api.edu.cdek.ru`, the public test account of CDEK's own docs)
 * through part A's code (t-2026-10-14-58): the order is registered the way
 * `CdekFulfillmentService.createFulfillment` registers one (`src/cdek/client.ts`),
 * the forms are fetched the way the panel's label and waybill routes fetch them
 * (`src/cdek/print.ts`). No database, no Medusa; the password is never printed.
 *
 * Writes into `out/t58-contour/` (gitignored; run-queue brings it back from boat):
 *   cdek-edu-label.pdf, cdek-edu-receipt.pdf, cdek-edu.json.
 *
 *   CONTOUR_KEYS_FILE=scripts/fixtures/contour-keys.local.txt \
 *     npx ts-node --transpile-only scripts/fixtures/cdek-edu-contour-evidence.ts
 *
 * The account (`CDEK_ACCOUNT` and `CDEK_PASSWORD`, the public test pair of CDEK's
 * docs) comes from the environment or from the keys file the command names:
 * `NAME=value` lines, untracked, never committed. A credential value never
 * stands in a command text (run-queue refuses such a ticket since 14.10).
 * `CDEK_BASE_URL` defaults to the EDU contour. The order is deleted at the end.
 */
import fs from "node:fs";
import path from "node:path";

import {
  CdekError,
  cdekErrorLogLine,
  createOrder,
  deleteOrder,
  getOrder,
  listTariffs,
  type CdekCredentials,
} from "../../src/cdek/client";
import { cdekPrintFailureReason, printCdekLabels, printCdekWaybill, type CdekPrintOptions } from "../../src/cdek/print";
import { CDEK_TEST_BASE } from "../../src/tenant-secrets/cdek";

const OUT = path.resolve(__dirname, "../../out/t58-contour");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (line: string) => console.log(line);
const shape = (value: unknown): string => (JSON.stringify(value ?? null) ?? "null").slice(0, 700);
const save = (name: string, bytes: Buffer | string) => {
  fs.writeFileSync(path.join(OUT, name), bytes);
  log(`saved ${name} (${Buffer.byteLength(bytes)} bytes)`);
};
const reason = (error: unknown): string =>
  error instanceof CdekError ? `${cdekPrintFailureReason(error)} — ${cdekErrorLogLine(error)}` : (error as Error).message;

/** Москва (44) → Санкт-Петербург (137), the same parcel as the ApiShip run. */
const FROM = { code: 44, city: "Москва", address: "ул Машкова, 21" };
const TO = { code: 137, city: "Санкт-Петербург", address: "Невский пр-кт, 1" };
const PACKAGE = { weight: 1000, length: 30, width: 20, height: 10 };

/** The EDU contour builds a form slowly at times: a read every three seconds, up to two minutes. */
const PRINT_OPTIONS: CdekPrintOptions = { pollDelaysMs: Array<number>(40).fill(3000), pollLimitMs: 120_000 };

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
  const account = process.env.CDEK_ACCOUNT ?? "";
  const password = process.env.CDEK_PASSWORD ?? "";
  if (!account || !password) {
    console.error("set CDEK_ACCOUNT and CDEK_PASSWORD (the public test pair from CDEK's docs)");
    process.exit(2);
  }
  const credentials: CdekCredentials = { base: (process.env.CDEK_BASE_URL ?? CDEK_TEST_BASE).replace(/\/$/, ""), account, password };
  log(`contour: ${credentials.base}, account ${account.slice(0, 4)}… (password kept in memory)`);

  const tariffs = await listTariffs(credentials, { from_location: { code: FROM.code }, to_location: { code: TO.code }, packages: [PACKAGE] });
  const doorToDoor = tariffs.filter((t) => t.delivery_mode === 1);
  const tariff = doorToDoor.find((t) => /посылка/i.test(t.tariff_name)) ?? doorToDoor[0];
  log(`tarifflist Москва → Санкт-Петербург: ${tariffs.length} tariffs, door-door ${doorToDoor.length}; chosen ${tariff ? `${tariff.tariff_code} ${tariff.tariff_name}, ${tariff.delivery_sum} ₽, ${tariff.period_min}–${tariff.period_max} дн` : "none"}`);
  if (!tariff) {
    console.error("no door-to-door tariff on the EDU contour: stopped");
    process.exit(1);
  }

  const number = `t58edu-${Date.now().toString(36)}`;
  const request = {
    number,
    tariff_code: tariff.tariff_code,
    comment: `Заказ ${number}`,
    from_location: FROM,
    to_location: TO,
    sender: { name: "Отправитель Тест", phones: [{ number: "+79250001115" }] },
    recipient: { name: "Получатель Тест", phones: [{ number: "+79250001116" }], email: "buyer@example.com" },
    packages: [
      {
        number: `${number}-1`,
        ...PACKAGE,
        comment: `Заказ ${number}`,
        items: [{ name: "Плед серый", ware_key: "PLED-1", payment: { value: 0 }, cost: 1000, weight: 1000, amount: 1 }],
      },
    ],
  };
  log(`POST /orders request: ${shape(request)}`);
  const ack = await createOrder(credentials, request);
  log(`POST /orders answer: ${shape(ack)}`);
  const uuid = ack.entity?.uuid;
  if (!uuid) {
    console.error("CDEK gave no uuid: stopped");
    process.exit(1);
  }

  // The order is registered asynchronously: the CDEK number appears on a later read.
  const started = Date.now();
  let info = await getOrder(credentials, uuid);
  while (!info.entity?.cdek_number && Date.now() - started < 90_000) {
    await sleep(3000);
    info = await getOrder(credentials, uuid);
    log(`  t+${Math.round((Date.now() - started) / 1000)}s cdek_number ${JSON.stringify(info.entity?.cdek_number ?? "")}, statuses ${(info.entity?.statuses ?? []).map((s) => s.code).join(">") || "-"}`);
  }
  log(`GET /orders/{uuid} answer: ${shape(info)}`);

  const files: Record<string, unknown> = {};
  try {
    const label = await printCdekLabels(credentials, [uuid], "A6", PRINT_OPTIONS);
    files.label = { uuid: label.uuid, bytes: label.pdf.length };
    log(`/print/barcodes: form ${label.uuid}, ${label.pdf.length} bytes`);
    save("cdek-edu-label.pdf", label.pdf);
  } catch (error) {
    files.label = { failed: reason(error) };
    log(`/print/barcodes failed: ${reason(error)}`);
  }
  try {
    const receipt = await printCdekWaybill(credentials, uuid, PRINT_OPTIONS);
    files.receipt = { uuid: receipt.uuid, bytes: receipt.pdf.length };
    log(`/print/orders: form ${receipt.uuid}, ${receipt.pdf.length} bytes`);
    save("cdek-edu-receipt.pdf", receipt.pdf);
  } catch (error) {
    files.receipt = { failed: reason(error) };
    log(`/print/orders failed: ${reason(error)}`);
  }

  let deleted: unknown = null;
  try {
    deleted = await deleteOrder(credentials, uuid);
    log(`DELETE /orders/{uuid} answer: ${shape(deleted)}`);
  } catch (error) {
    deleted = { failed: reason(error) };
    log(`DELETE /orders/{uuid} failed: ${reason(error)}`);
  }

  save(
    "cdek-edu.json",
    JSON.stringify(
      {
        base: credentials.base,
        at: new Date().toISOString(),
        tariff: { code: tariff.tariff_code, name: tariff.tariff_name, delivery_sum: tariff.delivery_sum, period_min: tariff.period_min, period_max: tariff.period_max },
        order: { number, uuid, cdek_number: info.entity?.cdek_number ?? null, statuses: info.entity?.statuses ?? [] },
        files,
        deleted,
      },
      null,
      2,
    ),
  );
  log(`\nSUMMARY ${JSON.stringify({ uuid, cdek_number: info.entity?.cdek_number ?? null, files })}`);
};

main().catch((error) => {
  console.error(`cdek edu run failed: ${reason(error)}`);
  process.exit(1);
});
