import http from "http";
import { DEFAULT_KEEP_ALIVE_TIMEOUT_MS, installHttpKeepAlive, keepAliveTimeoutMs } from "../http-keep-alive";

/**
 * pass 3b N12: the backend's server has to hold an idle keep-alive socket
 * longer than the proxy in front of it (90 s), or a request the proxy writes
 * to a socket Node has just closed comes back as 502.
 */

const ENV_KEY = "HTTP_KEEP_ALIVE_TIMEOUT_MS";
const httpModule = require("http") as { createServer: typeof http.createServer };
const original = httpModule.createServer;
const previousEnv = process.env[ENV_KEY];

afterEach(() => {
  httpModule.createServer = original;
  if (previousEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = previousEnv;
});

describe("installHttpKeepAlive", () => {
  it("leaves Node's five seconds on a server made before it is installed", () => {
    const server = http.createServer();

    expect(server.keepAliveTimeout).toBe(5_000);
  });

  it("gives every server made after it a keep-alive longer than the proxy's 90 s", () => {
    delete process.env[ENV_KEY];
    installHttpKeepAlive();

    const server = http.createServer();

    expect(server.keepAliveTimeout).toBe(95_000);
    expect(server.keepAliveTimeout).toBeGreaterThan(90_000);
  });

  it("keeps the headers timeout above the keep-alive one", () => {
    delete process.env[ENV_KEY];
    installHttpKeepAlive();

    const server = http.createServer();

    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
  });

  it("passes the request listener through", () => {
    delete process.env[ENV_KEY];
    installHttpKeepAlive();
    const listener = jest.fn();

    const server = http.createServer(listener);

    expect(server.listeners("request")).toEqual([listener]);
  });

  it("wraps once however often it is called", () => {
    delete process.env[ENV_KEY];
    installHttpKeepAlive();
    const first = httpModule.createServer;
    installHttpKeepAlive();

    expect(httpModule.createServer).toBe(first);
  });

  it("takes another value from the environment", () => {
    process.env[ENV_KEY] = "65000";
    installHttpKeepAlive();

    const server = http.createServer();

    expect(server.keepAliveTimeout).toBe(65_000);
    expect(server.headersTimeout).toBe(70_000);
  });

  it("leaves the server alone when the environment says 0", () => {
    process.env[ENV_KEY] = "0";
    installHttpKeepAlive();

    expect(httpModule.createServer).toBe(original);
    expect(http.createServer().keepAliveTimeout).toBe(5_000);
  });
});

describe("keepAliveTimeoutMs", () => {
  it.each([
    [undefined, DEFAULT_KEEP_ALIVE_TIMEOUT_MS],
    ["", DEFAULT_KEEP_ALIVE_TIMEOUT_MS],
    ["  ", DEFAULT_KEEP_ALIVE_TIMEOUT_MS],
    ["abc", DEFAULT_KEEP_ALIVE_TIMEOUT_MS],
    ["-1", DEFAULT_KEEP_ALIVE_TIMEOUT_MS],
    ["1.5", DEFAULT_KEEP_ALIVE_TIMEOUT_MS],
    ["0", 0],
    ["120000", 120_000],
  ])("reads %p as %p", (raw, expected) => {
    expect(keepAliveTimeoutMs(raw as string | undefined)).toBe(expected);
  });
});
