// node w3-footer-locale.mjs <base e.g. http://acme.localhost:8044> <outprefix> — footer attribution, starter traces, locale redirect, prices per locale, header controls; at 1280x900, 390x844 and 360x780
import { chromium } from "playwright";
const [base, out] = process.argv.slice(2);
const b = await chromium.launch();
const res = { base, viewports: {}, redirect: null, prices: {}, errors: [] };
// 1. redirect from / with an English browser
{
  const ctx = await b.newContext({ locale: "en-US", extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" } });
  const p = await ctx.newPage();
  const r = await p.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 180000 });
  res.redirect = { status: r?.status(), finalUrl: p.url().replace(base, ""), chain: (() => { let q = r?.request(); const c = []; while (q?.redirectedFrom()) { q = q.redirectedFrom(); c.push(q.url().replace(base, "")); } return c; })() };
  await ctx.close();
}
// 2. prices per locale (first 3 product cards) + header controls
for (const loc of ["ru", "en"]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: loc === "ru" ? "ru-RU" : "en-US" });
  const p = await ctx.newPage(); p.on("pageerror", (e) => res.errors.push(loc + ": " + String(e.message).slice(0, 80)));
  await p.goto(`${base}/${loc}/store`, { waitUntil: "networkidle", timeout: 180000 });
  res.prices[loc] = await p.evaluate(() => {
    const txt = [...document.querySelectorAll('[data-testid="product-wrapper"], [data-testid="home-product-card"]')].slice(0, 3).map((c) => c.innerText.replace(/\s+/g, " ").slice(0, 60));
    const ctl = ["nav-region-select-button", "nav-country-select-button", "nav-locale-select-button", "nav-language-select-button"].map((t) => t + "=" + document.querySelectorAll(`[data-testid="${t}"]`).length).join(" ");
    const header = document.querySelector("header")?.getAttribute("data-header-variant") ?? document.querySelector("[data-header-variant]")?.getAttribute("data-header-variant") ?? null;
    return { cards: txt, controls: ctl, headerVariant: header, currencyBadge: document.querySelector("header")?.innerText.match(/RUB|USD|₽|\$|EUR/g)?.slice(0, 3) ?? null };
  });
  await ctx.close();
}
// 3. footer per viewport
for (const [w, h] of [[1280, 900], [390, 844], [360, 780]]) {
  const mobile = w < 600;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: "ru-RU", isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage(); p.on("pageerror", (e) => res.errors.push(w + ": " + String(e.message).slice(0, 80)));
  await p.goto(base + "/ru", { waitUntil: "networkidle", timeout: 180000 });
  res.viewports[w] = await p.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none"; };
    const footer = document.querySelector("footer");
    const links = footer ? [...footer.querySelectorAll("a")].filter(vis).map((a) => ({ text: a.textContent.trim().slice(0, 40), href: a.getAttribute("href"), rel: a.getAttribute("rel"), target: a.getAttribute("target") })) : [];
    const attribution = footer ? (footer.innerText.match(/[^\n]*upready[^\n]*/i)?.[0] ?? null) : null;
    const attrVisible = footer ? [...footer.querySelectorAll("*")].some((el) => el.children.length === 0 && /upready/i.test(el.textContent) && vis(el)) : false;
    const html = document.documentElement.outerHTML;
    const traces = ["gorgojs", "medusa-dtc-starter", "docs.medusajs"].map((t) => t + "=" + (html.match(new RegExp(t, "g")) || []).length).join(" ");
    return { attribution, attrVisible, upreadyLinks: links.filter((l) => /upready/i.test(l.href || "") || /upready/i.test(l.text)), traces, footerLinkCount: links.length };
  });
  await p.screenshot({ path: `${out}-footer-${w}.png`, fullPage: true });
  await ctx.close();
}
console.log(JSON.stringify(res));
await b.close();
