/**
 * ApiShip orders, their documents, statuses and webhooks (t-2026-10-14-58),
 * on the request core of `./client.ts`.
 *
 * Measured on the test contour on 14.10.2026 (public account, a СДЭК test
 * connection), request and answer shapes in the task report:
 *
 * - `POST /orders` answers `{ orderId, created }` at once; the upload to the
 *   carrier is ASYNCHRONOUS. Three seconds later `GET /orders/{id}/status`
 *   answered `status.key = "uploading"` and an empty `providerNumber`.
 * - `POST /orders/labels` on an order the carrier has not accepted yet answers
 *   HTTP 200 with `url: null` and `failedOrders: [{ orderId, message: "Заказ не
 *   был передан в СД" }]`; `POST /orders/waybills` likewise with
 *   `waybillItems: null` and «Не получен ID заказа в системе службы доставки».
 *   A label exists only once the status is `uploaded` or later.
 * - `GET /orders/{id}/cancel` answers `{ orderId, canceled }`, `DELETE
 *   /orders/{id}` answers `{ orderId, deleted }`; both 200 on a fresh order.
 * - `POST /orders/statuses { orderIds }` (up to 100) answers
 *   `{ succeedOrders: [{ orderInfo, status }], failedOrders: [{ orderId, message }] }`.
 */

import { apishipRequest, type ApishipClientOptions, type ApishipCredentials } from "./client";

/* ------------------------------------------------------------- shapes */

export type ApishipAddress = {
  countryCode: string;
  postIndex?: string;
  region?: string;
  area?: string;
  city?: string;
  cityGuid?: string;
  street?: string;
  house?: string;
  block?: string;
  office?: string;
  lat?: number;
  lng?: number;
  /** The whole address on one line; ApiShip parses it when the parts are absent. */
  addressString: string;
  companyName?: string;
  companyInn?: string;
  contactName: string;
  phone: string;
  additionalPhone?: string;
  email?: string;
  comment?: string;
  brandName?: string;
};

export type ApishipItem = {
  description: string;
  quantity: number;
  articul?: string;
  barcode?: string;
  /** Declared value of one unit, roubles. */
  assessedCost?: number;
  /** Cash to collect for one unit, roubles; 0 for an order paid on the site. */
  cost?: number;
  costVat?: -1 | 0 | 5 | 7 | 10 | 20 | 22;
  /** Grams. */
  weight: number;
  height?: number;
  length?: number;
  width?: number;
  url?: string;
};

export type ApishipPlace = {
  placeNumber?: string;
  barcode?: string;
  weight: number;
  height?: number;
  length?: number;
  width?: number;
  items: ApishipItem[];
};

export type ApishipOrderRequest = {
  order: {
    clientNumber: string;
    providerKey: string;
    providerConnectId?: string;
    pickupType: 1 | 2;
    deliveryType: 1 | 2;
    tariffId: number;
    pointInId?: number;
    pointOutId?: number;
    weight: number;
    height?: number;
    length?: number;
    width?: number;
    description?: string;
    barcode?: string;
    pickupDate?: string;
    pickupTimeStart?: string;
    pickupTimeEnd?: string;
    deliveryDate?: string;
    deliveryTimeStart?: string;
    deliveryTimeEnd?: string;
  };
  cost: {
    assessedCost: number;
    codCost: number;
    deliveryCost?: number;
    deliveryCostVat?: -1 | 0 | 5 | 7 | 10 | 20 | 22;
    isDeliveryPayedByRecipient?: boolean;
    paymentMethod?: 1 | 2 | 3 | 4;
  };
  sender: ApishipAddress;
  recipient: ApishipAddress;
  returnAddress?: ApishipAddress;
  places: ApishipPlace[];
  extraParams?: Array<{ key: string; value: string }>;
};

export type ApishipOrderInfo = {
  orderId: string | number;
  providerKey?: string | null;
  providerNumber?: string | null;
  additionalProviderNumber?: string | null;
  returnProviderNumber?: string | null;
  barcode?: string | null;
  clientNumber?: string | null;
  checkUrl?: string | null;
  trackingUrl?: string | null;
  plannedDelivery?: { date?: string; timeStart?: string; timeEnd?: string } | null;
};

export type ApishipOrderStatus = {
  key: string;
  name?: string | null;
  description?: string | null;
  created?: string | null;
  providerCode?: string | null;
  providerName?: string | null;
  providerDescription?: string | null;
  createdProvider?: string | null;
  /** 100 an ApiShip error, 200 a carrier error, 300 bad data from the client. */
  errorCode?: string | null;
};

export type ApishipStatusAnswer = { orderInfo: ApishipOrderInfo; status: ApishipOrderStatus };

export type ApishipFailedOrder = { orderId: number | string; message: string };

/* -------------------------------------------------------------- orders */

/** `POST /orders` — register the shipment. The carrier's acceptance comes later, by status. */
export const createOrder = async (
  credentials: ApishipCredentials,
  input: ApishipOrderRequest,
  options: ApishipClientOptions = {},
): Promise<{ orderId: number; created: string | null }> => {
  const answer = await apishipRequest<{ orderId?: number | string; created?: string }>(
    credentials,
    "/orders",
    { method: "POST", body: input },
    options,
  );
  const orderId = Number(answer?.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error("ApiShip /orders answered no orderId");
  }
  return { orderId, created: typeof answer?.created === "string" ? answer.created : null };
};

export type ApishipOrderInfoAnswer = {
  order?: {
    orderId?: number;
    clientNumber?: string;
    providerKey?: string;
    providerNumber?: string | null;
    additionalProviderNumber?: string | null;
    tariffId?: number;
    pickupType?: number;
    deliveryType?: number;
    pointInId?: number | null;
    pointOutId?: number | null;
    trackingUrl?: string | null;
    weight?: number;
  };
  [key: string]: unknown;
};

/** `GET /orders/{id}` — the order as ApiShip holds it. */
export const getOrderInfo = async (
  credentials: ApishipCredentials,
  orderId: number,
  options: ApishipClientOptions = {},
): Promise<ApishipOrderInfoAnswer> =>
  apishipRequest<ApishipOrderInfoAnswer>(credentials, `/orders/${orderId}`, {}, options);

/** `GET /orders/{id}/status` — the current status with the carrier's number, when it has one. */
export const getOrderStatus = async (
  credentials: ApishipCredentials,
  orderId: number,
  options: ApishipClientOptions = {},
): Promise<ApishipStatusAnswer> =>
  apishipRequest<ApishipStatusAnswer>(credentials, `/orders/${orderId}/status`, {}, options);

/** `POST /orders/statuses` — up to 100 orders per call; more are chunked here. */
export const getOrderStatuses = async (
  credentials: ApishipCredentials,
  orderIds: number[],
  options: ApishipClientOptions = {},
): Promise<{ succeedOrders: ApishipStatusAnswer[]; failedOrders: ApishipFailedOrder[] }> => {
  const succeedOrders: ApishipStatusAnswer[] = [];
  const failedOrders: ApishipFailedOrder[] = [];
  for (let at = 0; at < orderIds.length; at += 100) {
    const chunk = orderIds.slice(at, at + 100);
    const answer = await apishipRequest<{
      succeedOrders?: ApishipStatusAnswer[];
      failedOrders?: ApishipFailedOrder[];
    }>(credentials, "/orders/statuses", { method: "POST", body: { orderIds: chunk } }, options);
    succeedOrders.push(...(answer?.succeedOrders ?? []));
    failedOrders.push(...(answer?.failedOrders ?? []));
  }
  return { succeedOrders, failedOrders };
};

/** `GET /orders/{id}/statusHistory` — every status ApiShip recorded, oldest first. */
export const getOrderStatusHistory = async (
  credentials: ApishipCredentials,
  orderId: number,
  options: ApishipClientOptions = {},
): Promise<{ orderInfo: ApishipOrderInfo; rows: ApishipOrderStatus[] }> => {
  const answer = await apishipRequest<{ orderInfo?: ApishipOrderInfo; rows?: ApishipOrderStatus[] }>(
    credentials,
    `/orders/${orderId}/statusHistory`,
    {},
    options,
  );
  return { orderInfo: answer?.orderInfo ?? { orderId }, rows: answer?.rows ?? [] };
};

/**
 * `GET /orders/{id}/cancel` — cancel in ApiShip and, when the carrier supports
 * it, in the carrier. The spec's own words: «пытается удалить или отменить
 * заказ из системы провайдера».
 */
export const cancelOrder = async (
  credentials: ApishipCredentials,
  orderId: number,
  options: ApishipClientOptions = {},
): Promise<{ orderId: number; canceled: string | null }> => {
  const answer = await apishipRequest<{ orderId?: number; canceled?: string }>(
    credentials,
    `/orders/${orderId}/cancel`,
    {},
    options,
  );
  return { orderId, canceled: typeof answer?.canceled === "string" ? answer.canceled : null };
};

/**
 * `DELETE /orders/{id}` — mark the order deleted in ApiShip. For СДЭК the spec
 * says the order is deleted in the carrier as well; for the others it is not
 * cancelled there, which is why `cancelOrder` is tried first.
 */
export const deleteOrder = async (
  credentials: ApishipCredentials,
  orderId: number,
  options: ApishipClientOptions = {},
): Promise<{ orderId: number; deleted: string | null }> => {
  const answer = await apishipRequest<{ orderId?: number; deleted?: string }>(
    credentials,
    `/orders/${orderId}`,
    { method: "DELETE" },
    options,
  );
  return { orderId, deleted: typeof answer?.deleted === "string" ? answer.deleted : null };
};

/* ----------------------------------------------------------- documents */

/** `POST /orders/labels` — one PDF with the labels of every order given. */
export const getLabels = async (
  credentials: ApishipCredentials,
  orderIds: number[],
  options: ApishipClientOptions = {},
): Promise<{ url: string | null; failedOrders: ApishipFailedOrder[] }> => {
  const answer = await apishipRequest<{ url?: string | null; failedOrders?: ApishipFailedOrder[] | null }>(
    credentials,
    "/orders/labels",
    { method: "POST", body: { orderIds, format: "pdf" } },
    options,
  );
  return {
    url: typeof answer?.url === "string" && answer.url ? answer.url : null,
    failedOrders: Array.isArray(answer?.failedOrders) ? answer.failedOrders : [],
  };
};

export type ApishipWaybill = { providerKey: string; file: string; orderIds: number[] };

/** `POST /orders/waybills` — one hand-over act per carrier among the orders given. */
export const getWaybills = async (
  credentials: ApishipCredentials,
  orderIds: number[],
  format: "pdf" | "xlsx" = "pdf",
  options: ApishipClientOptions = {},
): Promise<{ waybills: ApishipWaybill[]; failedOrders: ApishipFailedOrder[] }> => {
  const answer = await apishipRequest<{
    waybillItems?: Array<{ providerKey?: string; file?: string; orderIds?: Array<number | string> }> | null;
    failedOrders?: ApishipFailedOrder[] | null;
  }>(credentials, "/orders/waybills", { method: "POST", body: { orderIds, format } }, options);
  return {
    waybills: (Array.isArray(answer?.waybillItems) ? answer.waybillItems : [])
      .filter((item) => typeof item.file === "string" && item.file)
      .map((item) => ({
        providerKey: String(item.providerKey ?? ""),
        file: item.file as string,
        orderIds: (item.orderIds ?? []).map(Number),
      })),
    failedOrders: Array.isArray(answer?.failedOrders) ? answer.failedOrders : [],
  };
};

/**
 * The document behind a `storage.apiship.ru` link, as bytes. Only ApiShip's
 * own storage host is fetched, and the token is sent only when the storage
 * refuses an anonymous read: the host is a different one and the token has no
 * business there otherwise.
 */
export const downloadDocument = async (
  credentials: ApishipCredentials,
  url: string,
  options: ApishipClientOptions = {},
): Promise<{ bytes: Buffer; contentType: string }> => {
  const parsed = new URL(url);
  if (!/(^|\.)apiship\.ru$/.test(parsed.hostname)) {
    throw new Error(`refusing to download a document from ${parsed.hostname}`);
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const get = (headers: Record<string, string>) =>
    fetchImpl(url, { headers, signal: AbortSignal.timeout(options.timeoutMs ?? 60_000) });
  let response = await get({ Accept: "application/pdf,*/*" });
  if (response.status === 401 || response.status === 403) {
    response = await get({ Accept: "application/pdf,*/*", Authorization: credentials.token });
  }
  if (!response.ok) {
    throw new Error(`ApiShip storage answered ${response.status} for the document`);
  }
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
  };
};

/* ------------------------------------------------------------ webhooks */

export type ApishipWebhookType = "ORDER_STATUS" | "ORDER_NUMBER_UPDATE" | "PLANNED_DELIVERY_DATE_UPDATE";

export type ApishipWebhookSubscription = { uuid: string; url: string; type: ApishipWebhookType };

/** `GET /webhooks` — the cabinet's subscriptions (a bare array; `[]` on the fresh test account). */
export const listWebhooks = async (
  credentials: ApishipCredentials,
  options: ApishipClientOptions = {},
): Promise<ApishipWebhookSubscription[]> => {
  const answer = await apishipRequest<unknown>(credentials, "/webhooks", {}, options);
  const rows = Array.isArray(answer) ? answer : Array.isArray((answer as { rows?: unknown })?.rows) ? (answer as { rows: unknown[] }).rows : [];
  return (rows as Array<Record<string, unknown>>)
    .filter((row) => typeof row?.uuid === "string")
    .map((row) => ({
      uuid: String(row.uuid),
      url: String(row.url ?? ""),
      type: String(row.type ?? "") as ApishipWebhookType,
    }));
};

/** `POST /webhooks` — one subscription per event type; the same URL may serve several types. */
export const subscribeWebhook = async (
  credentials: ApishipCredentials,
  input: { url: string; type: ApishipWebhookType },
  options: ApishipClientOptions = {},
): Promise<{ uuid: string }> => {
  const answer = await apishipRequest<{ uuid?: string }>(
    credentials,
    "/webhooks",
    { method: "POST", body: input },
    options,
  );
  if (!answer?.uuid) {
    throw new Error("ApiShip /webhooks answered no uuid");
  }
  return { uuid: answer.uuid };
};

/** `DELETE /webhooks/{uuid}`. */
export const deleteWebhook = async (
  credentials: ApishipCredentials,
  uuid: string,
  options: ApishipClientOptions = {},
): Promise<void> => {
  await apishipRequest<unknown>(credentials, `/webhooks/${encodeURIComponent(uuid)}`, { method: "DELETE" }, options);
};
