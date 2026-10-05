import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { mockBtcpay, type MockBtcpay } from "../../src/btcpay/__tests__/mock-btcpay";

/**
 * A BTCPay Server stand-in for the BTCPay seam test (ask-20261005-070255-438f),
 * the way `sinks.ts` stands in for SMTP and Telegram: a real HTTP server on a
 * loopback port that the app under test calls with its own `fetch`, so nothing
 * in `src` is stubbed or given a test branch. It serves the same Greenfield
 * routes as the unit suite's `mockBtcpay`, which answers every request here.
 *
 * The shop's `server_url` is `http://127.0.0.1:<port>`: plain HTTP on a
 * loopback host, which `normalizeBtcpayServerUrl` accepts outside production.
 */
export const startBtcpayMock = async (options: {
  storeId: string;
  apiKey: string;
}): Promise<{ serverUrl: string; mock: MockBtcpay; close: () => Promise<void> }> => {
  let mock: MockBtcpay | null = null;

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
    const answer = await (mock as MockBtcpay).fetchImpl(`${serverUrl}${req.url ?? "/"}`, {
      method: req.method,
      headers,
      body: body || undefined,
    });
    res.writeHead(answer.status, { "content-type": "application/json" });
    res.end(await answer.text());
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  mock = mockBtcpay({ serverUrl, storeId: options.storeId, apiKey: options.apiKey });

  return {
    serverUrl,
    mock,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};
