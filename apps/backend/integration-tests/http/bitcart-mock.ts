import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { mockBitcart, type MockBitcart } from "../../src/bitcart/__tests__/mock-bitcart";

/**
 * A Bitcart stand-in for the Bitcart seam test (ask-20261005-070255-438f,
 * stage 2), the way `btcpay-mock.ts` stands in for BTCPay: a real HTTP server
 * on a loopback port that the app under test calls with its own `fetch`, so
 * nothing in `src` is stubbed or given a test branch. Every request is
 * answered by the unit suite's `mockBitcart`.
 *
 * The shop's `server_url` is `http://127.0.0.1:<port>/api` and its
 * `admin_url` `http://127.0.0.1:<port>/admin`, Bitcart's one-domain layout:
 * plain HTTP on a loopback host, which `normalizeBitcartUrl` accepts outside
 * production.
 */
export const startBitcartMock = async (options: {
  storeId: string;
  apiKey: string;
}): Promise<{ serverUrl: string; adminUrl: string; mock: MockBitcart; close: () => Promise<void> }> => {
  let mock: MockBitcart | null = null;

  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve, reject) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => (body += chunk));
      req.on("end", () => resolve(body));
      req.on("error", reject);
    });

  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers.set(name, value);
    }
    const answer = await (mock as MockBitcart).fetchImpl(`${origin}${req.url ?? "/"}`, {
      method: req.method,
      headers,
      body: body || undefined,
    });
    res.writeHead(answer.status, { "content-type": "application/json" });
    res.end(await answer.text());
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const serverUrl = `${origin}/api`;
  mock = mockBitcart({ serverUrl, storeId: options.storeId, apiKey: options.apiKey });

  return {
    serverUrl,
    adminUrl: `${origin}/admin`,
    mock,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};
