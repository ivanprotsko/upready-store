#!/usr/bin/env node
/**
 * apiship-measure.mjs — a READ-ONLY measurement of one ApiShip cabinet
 * (t-2026-10-14-58, step 0 of the lead's update of 14.10 13:10).
 *
 * What it answers, in numbers and provider keys only:
 *
 *   1. `GET /connections`      — which carriers the cabinet has connected;
 *   2. `GET /lists/providers`  — the provider keys of СДЭК and Почта России as
 *                                ApiShip names them (no guessing);
 *   3. `GET /lists/tariffs`    — how many tariffs each connected carrier has;
 *   4. `POST /calculator`      — Moscow → Saint Petersburg, 1 kg, for those two
 *                                carriers, to the door and to a pickup point.
 *
 * What it never prints: the token, any request or response HEADER, and the
 * `connectParams` of a connection (they hold the carrier's own login and
 * password). Error bodies are printed by their `code` and `message` only.
 *
 * Usage:
 *   APISHIP_TOKEN=<token> [APISHIP_BASE_URL=https://api.apiship.ru/v1] \
 *     node scripts/apiship-measure.mjs [--verbose] [--json]
 *
 *   The test contour (`http://api.dev.apiship.ru/v1`) has a PUBLIC account,
 *   login `test` / password `test` (docs.apiship.ru/docs/api/). For it, pass
 *   APISHIP_LOGIN and APISHIP_PASSWORD instead of a token and the script logs
 *   in itself (`POST /users/login`) and keeps the token in memory only.
 *
 * Flags:
 *   --verbose   also list each returned tariff: id, name, cost, days (no secrets)
 *   --json      print the whole measurement as one JSON object instead of lines
 *   --help      this text
 *
 * Exit codes: 0 measured; 2 usage (no token and no login); 3 ApiShip refused
 * the token (401/403); 4 a transport failure (no HTTP answer at all).
 */

const USAGE = `usage: APISHIP_TOKEN=<token> node scripts/apiship-measure.mjs [--verbose] [--json]
       APISHIP_LOGIN=test APISHIP_PASSWORD=test APISHIP_BASE_URL=http://api.dev.apiship.ru/v1 node scripts/apiship-measure.mjs`;

const KNOWN_FLAGS = new Set(["--verbose", "--json", "--help"]);

const parseArgs = (argv) => {
  const flags = { verbose: false, json: false, help: false };
  for (const arg of argv) {
    if (!KNOWN_FLAGS.has(arg)) {
      throw new Error(`unknown flag «${arg}»\n${USAGE}`);
    }
    flags[arg.slice(2)] = true;
  }
  return flags;
};

/** Moscow → Saint Petersburg, the route the 16.09 measurement used. */
const ROUTE = {
  from: { countryCode: "RU", city: "Москва", index: 101000 },
  to: { countryCode: "RU", city: "Санкт-Петербург", index: 190000 },
};
const PLACE_1KG = { weight: 1000, length: 30, width: 20, height: 10 };
const TIMEOUT_MS = 30_000;

const base = (process.env.APISHIP_BASE_URL ?? "https://api.apiship.ru/v1").replace(/\/$/, "");

/**
 * One HTTP call. Returns `{ status, body }` where `body` is parsed JSON or
 * `null`; a transport failure throws. Nothing here logs a header.
 */
const call = async (token, method, path, body) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return { status: response.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
};

/** `code: message` of an ApiShip error body, or the bare status. */
const errorLine = (status, body) => {
  if (body && typeof body === "object") {
    const code = body.code ?? "";
    const message = body.message ?? body.description ?? "";
    return `HTTP ${status}${code ? ` ${code}` : ""}${message ? `: ${message}` : ""}`;
  }
  return `HTTP ${status}`;
};

const login = async (loginName, password) => {
  const { status, body } = await call(null, "POST", "/users/login", { login: loginName, password });
  if (status !== 200 || !body?.token) {
    throw Object.assign(new Error(`login refused: ${errorLine(status, body)}`), { exit: 3 });
  }
  return body.token;
};

const summarizeCalculator = (body) => {
  const perProvider = (groups) =>
    (Array.isArray(groups) ? groups : []).map((group) => ({
      providerKey: group.providerKey,
      tariffs: Array.isArray(group.tariffs) ? group.tariffs.length : 0,
      list: (Array.isArray(group.tariffs) ? group.tariffs : []).map((tariff) => ({
        tariffId: tariff.tariffId,
        tariffName: tariff.tariffName,
        deliveryCost: tariff.deliveryCost,
        days:
          tariff.calendarDaysMin != null || tariff.calendarDaysMax != null
            ? `${tariff.calendarDaysMin ?? "?"}-${tariff.calendarDaysMax ?? "?"}`
            : `${tariff.daysMin ?? "?"}-${tariff.daysMax ?? "?"}`,
      })),
    }));
  return {
    door: perProvider(body?.deliveryToDoor),
    point: perProvider(body?.deliveryToPoint),
  };
};

const main = async () => {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(USAGE);
    return 0;
  }

  let token = process.env.APISHIP_TOKEN ?? "";
  const result = { base, login: null, connections: null, providers: null, tariffs: null, calculator: {} };

  if (!token) {
    const loginName = process.env.APISHIP_LOGIN ?? "";
    const password = process.env.APISHIP_PASSWORD ?? "";
    if (!loginName || !password) {
      console.error(USAGE);
      return 2;
    }
    token = await login(loginName, password);
    result.login = { status: 200, tokenLength: token.length };
  }

  // 1. Connections: provider keys only; `connectParams` hold the carrier's login.
  {
    const { status, body } = await call(token, "GET", "/connections?limit=100");
    if (status === 401 || status === 403) {
      console.error(`connections: token refused (${errorLine(status, body)})`);
      return 3;
    }
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    result.connections = {
      status,
      total: body?.meta?.total ?? rows.length,
      rows: rows.map((row) => ({
        id: row.id,
        providerKey: row.providerKey,
        isUseBaseConnect: row.isUseBaseConnect ?? null,
        test: row.connectParams && typeof row.connectParams === "object" ? row.connectParams.test ?? null : null,
      })),
      error: status >= 400 ? errorLine(status, body) : null,
    };
  }

  // 2. Providers: the keys ApiShip uses for СДЭК and Почта России.
  {
    const { status, body } = await call(token, "GET", "/lists/providers?limit=500&offset=0");
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const byName = (needle) =>
      rows.filter((row) => String(row.name ?? "").toLowerCase().includes(needle)).map((row) => row.key);
    result.providers = {
      status,
      total: body?.meta?.total ?? rows.length,
      cdek: rows.some((row) => row.key === "cdek") ? ["cdek"] : byName("сдэк"),
      pochta: byName("почт"),
      error: status >= 400 ? errorLine(status, body) : null,
    };
  }

  const carrierKeys = [...new Set([...result.providers.cdek, ...result.providers.pochta])];

  // 3. Tariffs per provider.
  {
    const { status, body } = await call(token, "GET", "/lists/tariffs?limit=1000&offset=0");
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const perProvider = {};
    for (const row of rows) {
      perProvider[row.providerKey] = (perProvider[row.providerKey] ?? 0) + 1;
    }
    result.tariffs = {
      status,
      total: body?.meta?.total ?? rows.length,
      perProvider,
      error: status >= 400 ? errorLine(status, body) : null,
    };
  }

  // 4. The calculator, three ways: both delivery types at once, door only, point only.
  const variants = {
    both: {},
    door: { deliveryTypes: [1] },
    point: { deliveryTypes: [2] },
  };
  for (const [name, extra] of Object.entries(variants)) {
    const { status, body } = await call(token, "POST", "/calculator", {
      ...ROUTE,
      places: [PLACE_1KG],
      assessedCost: 1000,
      codCost: 0,
      includeFees: false,
      timeout: 20000,
      ...(carrierKeys.length ? { providerKeys: carrierKeys } : {}),
      ...extra,
    });
    result.calculator[name] = {
      status,
      ...(status === 200 ? summarizeCalculator(body) : { error: errorLine(status, body) }),
    };
  }

  if (flags.json) {
    const out = structuredClone(result);
    if (!flags.verbose) {
      for (const variant of Object.values(out.calculator)) {
        for (const side of ["door", "point"]) {
          for (const group of variant[side] ?? []) delete group.list;
        }
      }
    }
    console.log(JSON.stringify(out, null, 2));
    return 0;
  }

  console.log(`ApiShip measurement — base ${base}`);
  if (result.login) console.log(`login: HTTP ${result.login.status} (token kept in memory)`);
  console.log(
    `connections: HTTP ${result.connections.status}, total ${result.connections.total}` +
      (result.connections.error ? ` — ${result.connections.error}` : ""),
  );
  for (const row of result.connections.rows) {
    console.log(`  - ${row.providerKey} (id ${row.id}, base connect ${row.isUseBaseConnect ?? "?"}, test ${row.test ?? "?"})`);
  }
  console.log(
    `providers: HTTP ${result.providers.status}, total ${result.providers.total}; cdek → [${result.providers.cdek.join(", ")}], pochta → [${result.providers.pochta.join(", ")}]` +
      (result.providers.error ? ` — ${result.providers.error}` : ""),
  );
  console.log(
    `tariffs: HTTP ${result.tariffs.status}, total ${result.tariffs.total}` +
      (result.tariffs.error ? ` — ${result.tariffs.error}` : ""),
  );
  for (const [key, count] of Object.entries(result.tariffs.perProvider)) {
    console.log(`  - ${key}: ${count}`);
  }
  for (const [name, variant] of Object.entries(result.calculator)) {
    console.log(`calculator (${name}): HTTP ${variant.status}${variant.error ? ` — ${variant.error}` : ""}`);
    for (const side of ["door", "point"]) {
      for (const group of variant[side] ?? []) {
        console.log(`  - ${side} ${group.providerKey}: ${group.tariffs} tariff(s)`);
        if (flags.verbose) {
          for (const tariff of group.list) {
            console.log(`      · #${tariff.tariffId} ${tariff.tariffName}: ${tariff.deliveryCost} ₽, ${tariff.days} дн.`);
          }
        }
      }
      if (!(variant[side] ?? []).length && variant.status === 200) {
        console.log(`  - ${side}: no provider group in the answer`);
      }
    }
  }
  return 0;
};

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error.message);
    process.exit(error.exit ?? 4);
  });
