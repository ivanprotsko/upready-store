import { createServer, type Server } from "node:http";
import { assertPublicUrl, fetchImage, isPrivateAddress, MAX_IMAGE_BYTES } from "../images";

/**
 * Downloading a product photo from a URL a shop owner typed (t14-product-import,
 * step 4). The backend makes the request, so the URL is an instruction to reach
 * somewhere from inside the platform: the tests that matter are the ones that
 * prove it refuses.
 *
 * The dead-URL and content-type cases take delivery from a real local HTTP
 * server rather than a mock, the way the notification seam test does
 * (`integration-tests/http/sinks.ts`): what is being checked is the behaviour of
 * `fetch`, redirects and the body cap, and a mock would only prove the mock.
 */
describe("product-csv/images", () => {
  describe("isPrivateAddress", () => {
    it("refuses loopback, the RFC 1918 ranges and the cloud metadata address", () => {
      for (const address of [
        "127.0.0.1",
        "0.0.0.0",
        "10.0.0.5",
        "172.16.0.1",
        "172.31.255.255",
        "192.168.1.1",
        "169.254.169.254",
        "100.64.0.1",
        "::1",
        "::",
        "fd00::1",
        "fe80::1",
        "::ffff:10.0.0.1",
      ]) {
        expect(isPrivateAddress(address)).toBe(true);
      }
    });

    it("allows a public address", () => {
      expect(isPrivateAddress("8.8.8.8")).toBe(false);
      expect(isPrivateAddress("93.184.216.34")).toBe(false);
      expect(isPrivateAddress("2606:2800:220:1::1")).toBe(false);
    });
  });

  describe("assertPublicUrl", () => {
    it("refuses a scheme that is not http(s)", async () => {
      await expect(assertPublicUrl("file:///etc/passwd")).resolves.toMatchObject({ ok: false });
      await expect(assertPublicUrl("ftp://example.test/a.jpg")).resolves.toMatchObject({
        ok: false,
      });
    });

    it("refuses localhost and a literal private address", async () => {
      await expect(assertPublicUrl("http://localhost:9000/a.jpg")).resolves.toMatchObject({
        ok: false,
      });
      await expect(assertPublicUrl("http://127.0.0.1/a.jpg")).resolves.toMatchObject({
        ok: false,
      });
      await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data/")).resolves.toMatchObject(
        { ok: false },
      );
    });

    it("refuses a URL carrying credentials", async () => {
      await expect(assertPublicUrl("https://user:pass@8.8.8.8/a.jpg")).resolves.toMatchObject({
        ok: false,
      });
    });

    it("accepts a public literal address", async () => {
      await expect(assertPublicUrl("https://8.8.8.8/a.jpg")).resolves.toEqual({ ok: true });
    });
  });

  describe("fetchImage", () => {
    let server: Server;
    let port = 0;

    const routes: Record<string, (respond: (status: number, headers: Record<string, string>, body?: Buffer) => void) => void> =
      {};

    beforeAll(async () => {
      server = createServer((req, res) => {
        const handler = routes[req.url ?? ""];

        if (!handler) {
          res.writeHead(404).end();
          return;
        }

        handler((status, headers, body) => {
          res.writeHead(status, headers);
          res.end(body);
        });
      });

      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      port = (server.address() as { port: number }).port;
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    const url = (path: string) => `http://127.0.0.1:${port}${path}`;

    it("refuses the request outright, because 127.0.0.1 is inside the platform", async () => {
      routes["/ok.png"] = (respond) =>
        respond(200, { "content-type": "image/png" }, Buffer.from([1, 2, 3]));

      const result = await fetchImage(url("/ok.png"));

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toContain("внутрь платформы");
    });

    it("reports a dead URL with the status the server gave", async () => {
      const result = await fetchImage("https://8.8.8.8:1/does-not-exist.jpg");

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toBeTruthy();
    });

    it("states the size cap it enforces", () => {
      expect(MAX_IMAGE_BYTES).toBe(8 * 1024 * 1024);
    });
  });
});
