/**
 * Host-rewriting proxy for the local acceptance stand: the fixed panel runs from
 * this worktree (vite dev) and talks to the LIVE backend of the real shop, so the
 * measurement happens on the real product and the real storefront.
 *
 * Vite's own proxy keeps `changeOrigin: false` (the session cookie has to stay
 * first-party for the panel's own origin), and traefik on the live host routes by
 * `Host`, so a request arriving as `Host: localhost:5185` never reaches the panel.
 * This hop sets the Host (and TLS SNI) to the live origin and passes everything
 * else through untouched, Set-Cookie included (the session cookie is host-only and
 * not Secure, so the browser keeps it for localhost).
 *
 *   node proxy.mjs [port] [target-host]
 */
import http from 'node:http';
import https from 'node:https';

const PORT = Number(process.argv[2] || 5199);
const TARGET = process.argv[3] || 'panel-store.upready.dev';

const server = http.createServer((req, res) => {
  const headers = { ...req.headers, host: TARGET };
  delete headers['accept-encoding'];
  const upstream = https.request(
    { host: TARGET, servername: TARGET, port: 443, method: req.method, path: req.url, headers },
    (r) => {
      res.writeHead(r.statusCode || 502, r.headers);
      r.pipe(res);
    }
  );
  upstream.on('error', (e) => {
    console.error(`[proxy] ${req.method} ${req.url} -> ${String(e)}`);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('proxy error: ' + String(e));
  });
  req.pipe(upstream);
});

server.listen(PORT, '127.0.0.1', () => console.log(`[proxy] 127.0.0.1:${PORT} -> https://${TARGET}`));
