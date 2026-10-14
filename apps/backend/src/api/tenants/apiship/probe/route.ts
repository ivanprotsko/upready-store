import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import {
  calculate,
  listConnections,
  probeApishipToken,
  type ApishipCalculatorGroup,
  type ApishipCalculatorTariff,
  type ApishipConnection,
} from "../../../../apiship/client";
import { APISHIP_DEFAULT_CARRIERS, carrierLabel } from "../../../../apiship/carriers";
import { tariffDays } from "../../../../apiship/method";
import { apishipApiCredentials, readApishipSecret } from "../../../../tenant-secrets/apiship";
import { getTenantScope } from "../../tenant-scope";

/**
 * `GET /tenants/apiship/probe[?calculator=1]` — read-only calls to ApiShip
 * asking whether the stored token is accepted and what the cabinet can do
 * (p01-settings-integrations-restructure, extended in t-2026-10-14-58).
 *
 * Separate from `/tenants/apiship` on purpose: the settings route answers
 * from our own database in a millisecond and the panel renders the form off
 * it, so a slow or dead ApiShip cannot hold the screen. The probe is its own
 * query, and while it is in flight the page says «спрашиваем ApiShip…» rather
 * than inventing a verdict (rule 19h).
 *
 * Three answers, never two (rule 20a): no token stored at all
 * (`token_set: false`), a token ApiShip rejected (`probe.ok: false` with the
 * status it answered), and a token ApiShip accepted — then `connections`
 * lists the carriers the cabinet has connected.
 *
 * `?calculator=1` adds the measurement the task asks for (acceptance 2): the
 * calculator for a fixed route, Moscow → Saint Petersburg, 1 kg, to the door
 * and to a point, for every connected carrier. It takes seconds (ApiShip
 * waits on each carrier), so it is opt-in. Zero tariffs with HTTP 200 is the
 * cabinet's state, not an error: the report says what the owner must set up.
 */
const ROUTE = {
  from: { countryCode: "RU", city: "Москва", index: "101000" },
  to: { countryCode: "RU", city: "Санкт-Петербург", index: "190000" },
};
const PLACE_1KG = { weight: 1000, length: 30, width: 20, height: 10 };

type CheapestTariff = { tariff_id: number; name: string; cost: number; days_min: number; days_max: number } | null;

const cheapestOf = (groups: ApishipCalculatorGroup[], providerKey: string): { tariffs: number; cheapest: CheapestTariff } => {
  const group = groups.find((entry) => entry.providerKey === providerKey);
  const tariffs = group?.tariffs ?? [];
  const best = tariffs.reduce<ApishipCalculatorTariff | null>(
    (acc, tariff) => (acc === null || tariff.deliveryCost < acc.deliveryCost ? tariff : acc),
    null,
  );
  const days = best ? tariffDays(best) : null;
  return {
    tariffs: tariffs.length,
    cheapest: best && days
      ? { tariff_id: best.tariffId, name: best.tariffName, cost: best.deliveryCost, days_min: days.min, days_max: days.max }
      : null,
  };
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = await readApishipSecret(pg, tenant.id, { includeDisabled: true });
  const api = apishipApiCredentials(secret);

  if (!secret?.credentials.token || !api) {
    res.json({ token_set: false, probe: null, connections: [], providers_connected: [], calculator: null });
    return;
  }

  const probe = await probeApishipToken(secret.credentials.token);
  if (!probe.ok) {
    res.json({ token_set: true, probe, connections: [], providers_connected: [], calculator: null });
    return;
  }

  let connections: ApishipConnection[] = [];
  try {
    connections = await listConnections(api);
  } catch {
    // The probe already said the token is accepted; a list that failed a
    // second later stays an empty list rather than a verdict about the token.
  }
  const providersConnected = [...new Set(connections.map((connection) => connection.providerKey))];

  const wantsCalculator = String((req.query as Record<string, unknown>)?.calculator ?? "") === "1";
  let calculator: Record<string, unknown> | null = null;
  if (wantsCalculator) {
    const keys = providersConnected.length ? providersConnected : [...APISHIP_DEFAULT_CARRIERS];
    try {
      const answer = await calculate(api, {
        ...ROUTE,
        places: [PLACE_1KG],
        providerKeys: keys,
        assessedCost: 1000,
        codCost: 0,
        includeFees: false,
        timeout: 20_000,
      });
      calculator = {
        route: { from: ROUTE.from.city, to: ROUTE.to.city, weight_g: PLACE_1KG.weight },
        results: keys.map((key) => ({
          provider_key: key,
          label: carrierLabel(key),
          connected: providersConnected.includes(key),
          door: cheapestOf(answer.deliveryToDoor, key),
          point: cheapestOf(answer.deliveryToPoint, key),
        })),
        error: null,
      };
    } catch (error) {
      calculator = { route: { from: ROUTE.from.city, to: ROUTE.to.city, weight_g: PLACE_1KG.weight }, results: [], error: (error as Error).message };
    }
  }

  res.json({
    token_set: true,
    probe,
    connections: connections.map((connection) => ({
      id: connection.id,
      provider_key: connection.providerKey,
      label: carrierLabel(connection.providerKey),
      name: connection.name,
      test: connection.test,
    })),
    providers_connected: providersConnected,
    calculator,
  });
};
