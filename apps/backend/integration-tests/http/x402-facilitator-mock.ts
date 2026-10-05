import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { mockFacilitator, type MockFacilitator } from "../../src/x402/__tests__/mock-facilitator";

/**
 * An x402 facilitator stand-in for the x402 seam test (t-2026-10-03-33), the
 * way `btcpay-mock.ts` stands in for BTCPay: a real HTTP server on a loopback
 * port that the app under test calls with its own `fetch`, answering every
 * request through the unit suites' `mockFacilitator`. Nothing reaches a chain
 * or a real facilitator.
 *
 * The shop's `facilitator_url` is `http://127.0.0.1:<port>`: plain HTTP on a
 * loopback host, which `normalizeX402FacilitatorUrl` accepts outside production.
 */
export const startFacilitatorMock = async (): Promise<{ url: string; mock: MockFacilitator; close: () => Promise<void> }> => {
  let mock: MockFacilitator | null = null;

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
    const answer = await (mock as MockFacilitator).fetchImpl(`${url}${req.url ?? "/"}`, {
      method: req.method,
      headers: { "content-type": "application/json" },
      body: body || undefined,
    });
    res.writeHead(answer.status, { "content-type": "application/json" });
    res.end(await answer.text());
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  mock = mockFacilitator(url);

  return { url, mock, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
};
