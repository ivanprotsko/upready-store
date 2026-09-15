/**
 * Saves documentation pages guarded by an antibot (dev.wildberries.ru answers curl
 * with HTTP 498, docs.ozon.ru with a 307 redirect loop / 403).
 *
 * Playwright's own launchPersistentContext is detected; a Chrome started by hand with
 * --remote-debugging-port and driven over CDP is not (w01 measured the same, see
 * artifacts/docs/w01-wb-readonly-client/report.md).
 *
 * Usage: node fetch-docs-cdp.cjs <urls.json> <out-dir> [cdp-port]
 */
const fs = require("node:fs");
const path = require("node:path");

const [, , urlsFile, outDir, portArg] = process.argv;
const PORT = portArg || "9333";

const main = async () => {
  const { chromium } = require("playwright");
  const jobs = JSON.parse(fs.readFileSync(urlsFile, "utf8"));
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  const stamp = new Date().toISOString();
  for (const job of jobs) {
    const out = path.join(outDir, job.file);
    let status = "n/a";
    try {
      const resp = await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 90_000 });
      status = resp ? String(resp.status()) : "no-response";
      if (job.waitFor) {
        await page.waitForSelector(job.waitFor, { timeout: 45_000 }).catch(() => {});
      }
      await page.waitForTimeout(job.settleMs ?? 5000);
      if (job.expand) {
        // Open every collapsed section of an openapi renderer, then let it settle.
        for (let i = 0; i < (job.expandRounds ?? 2); i += 1) {
          await page.evaluate((sel) => {
            document.querySelectorAll(sel).forEach((el) => el.click());
          }, job.expand).catch(() => {});
          await page.waitForTimeout(2500);
        }
      }
      const data = await page.evaluate(() => {
        const text = document.body ? document.body.innerText : "";
        const links = Array.from(document.querySelectorAll("a[href]"))
          .map((a) => `${(a.textContent || "").trim().replace(/\s+/g, " ")} :: ${a.getAttribute("href")}`)
          .filter((l) => l.length > 5);
        return { text, links: Array.from(new Set(links)), title: document.title };
      });
      const header = [
        `URL: ${job.url}`,
        `FINAL-URL: ${page.url()}`,
        `HTTP: ${status}`,
        `TITLE: ${data.title}`,
        `SAVED: ${stamp} (UTC) — headed Google Chrome over CDP, Ivan's permission 2026-09-16 04:41 WITA`,
        `TEXT-CHARS: ${data.text.length}  LINKS: ${data.links.length}`,
        "=".repeat(78),
        "",
      ].join("\n");
      fs.writeFileSync(out, `${header}${data.text}\n`);
      fs.writeFileSync(out.replace(/\.txt$/, ".links.txt"), `${data.links.join("\n")}\n`);
      console.log(`OK  ${status} ${data.text.length}ch ${data.links.length}links -> ${job.file}`);
    } catch (err) {
      fs.writeFileSync(out, `URL: ${job.url}\nHTTP: ${status}\nERROR: ${err.message}\nSAVED: ${stamp}\n`);
      console.log(`ERR ${job.url}: ${err.message}`);
    }
  }
  await page.close();
  await browser.close();
};

main().catch((e) => {
  console.error("FATAL", e && e.message);
  process.exit(1);
});
