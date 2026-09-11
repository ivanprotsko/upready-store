const { chromium } = require('/opt/homebrew/lib/node_modules/playwright');
const http = require('http');
const zlib = require('zlib');

// A 1x1 PNG, served under four names. We only care WHICH names the browser asks for.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAABFCFvuAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=',
  'base64'
);

const HTML = `<!doctype html><html data-mode="light"><head><style>
  .pair{position:relative;width:300px;height:400px}
  .pair img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  /* exactly what tailwind's dark:hidden / hidden dark:block compile to */
  .light{display:block} .dark{display:none}
  html[data-mode="dark"] .light{display:none}
  html[data-mode="dark"] .dark{display:block}
  .spacer{height:3000px}
</style></head><body>
<div class="pair">
  <img class="light" src="/light-eager.png" alt="">
  <img class="dark" src="/dark-lazy.png" loading="lazy" alt="">
</div>
<div class="pair">
  <img class="light" src="/light2-eager.png" alt="">
  <img class="dark" src="/dark2-eager.png" alt="">
</div>
<div class="spacer"></div>
</body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/') { res.writeHead(200, {'content-type':'text/html'}); res.end(HTML); return; }
  if (req.url.endsWith('.png')) { res.writeHead(200, {'content-type':'image/png'}); res.end(PNG); return; }
  res.writeHead(404); res.end();
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const asked = [];
  page.on('request', (r) => { if (r.resourceType() === 'image') asked.push(new URL(r.url()).pathname); });

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  console.log('AFTER LOAD, mode=light, image requests:', JSON.stringify(asked.slice().sort()));

  const before = asked.length;
  await page.evaluate(() => document.documentElement.setAttribute('data-mode', 'dark'));
  await page.waitForTimeout(1200);
  console.log('AFTER FLIP to dark, new image requests:', JSON.stringify(asked.slice(before).sort()));

  await browser.close();
  server.close();
})().catch((e) => { console.error('PROBE FAILED:', e.message); process.exit(1); });
