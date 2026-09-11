const PW = require('/opt/homebrew/lib/node_modules/playwright');
const http = require('http');
// Валидная картинка с заведомо известными размерами: naturalWidth докажет, что загрузка
// действительно дошла до конца, а не что просто сработал таймаут.
const IMG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16"><rect width="24" height="16" fill="#888"/></svg>', 'utf8');
const HTML = `<!doctype html><html><head><style>.h{display:none}</style></head><body>
<img id="a" class="h" src="/a.png" loading="lazy" alt="">
<img id="b" class="h" src="/b.png" loading="lazy" alt="">
</body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.writeHead(200, {'content-type':'text/html'}); res.end(HTML); return; }
  if (req.url.endsWith('.png')) { setTimeout(() => { res.writeHead(200, {'content-type':'image/svg+xml'}); res.end(IMG); }, 60); return; }
  res.writeHead(404); res.end();
});
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const engine = process.argv[2];
  const browser = await PW[engine].launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const asked = [];
  page.on('request', (r) => { if (r.resourceType() === 'image') asked.push(new URL(r.url()).pathname); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const atLoad = asked.slice();

  // path 1: decode() on a hidden lazy image
  const r1 = await page.evaluate(async () => {
    const img = document.getElementById('a');
    const race = await Promise.race([
      img.decode().then(() => 'resolved').catch((e) => 'rejected:' + e.name),
      new Promise((r) => setTimeout(() => r('timeout-800ms'), 800)),
    ]);
    return { race, complete: img.complete };
  });
  // path 2: loading = 'eager' then wait for complete
  const r2 = await page.evaluate(async () => {
    const img = document.getElementById('b');
    img.loading = 'eager';
    if (img.complete) return { ok: true, already: true };
    await new Promise((res) => { img.addEventListener('load', res, { once: true }); img.addEventListener('error', res, { once: true }); setTimeout(res, 1000); });
    const decoded = await Promise.race([
      img.decode().then(() => 'decoded').catch((e) => 'rejected:' + e.name),
      new Promise((r) => setTimeout(() => r('timeout-800ms'), 800)),
    ]);
    return { complete: img.complete, naturalWidth: img.naturalWidth, decoded };
  });
  await page.waitForTimeout(200);
  console.log(engine, '| at load:', JSON.stringify(atLoad), '| after warm:', JSON.stringify(asked.slice(atLoad.length).sort()));
  console.log(engine, '| decode():', JSON.stringify(r1), '| loading=eager:', JSON.stringify(r2));
  await browser.close(); server.close();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
