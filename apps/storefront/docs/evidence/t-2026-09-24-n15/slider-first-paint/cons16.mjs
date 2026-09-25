// Remark 16: console errors / hydration warnings on the home page (dev), both engines.
import { chromium, firefox } from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.mjs";
for (const [name, eng, opts] of [["chromium", chromium, {}], ["firefox", firefox, { executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox` }]]) {
  const b = await eng.launch(opts);
  for (const w of [1440, 360]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    const msgs = [];
    p.on("console", (m) => { if (["error", "warning"].includes(m.type())) msgs.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
    p.on("pageerror", (e) => msgs.push(`pageerror: ${e.message.slice(0, 160)}`));
    await p.goto(process.argv[2], { waitUntil: "networkidle", timeout: 180000 });
    await p.waitForTimeout(1500);
    console.log(name, w, msgs.filter((m) => /hydrat|mismatch|pageerror|did not match/i.test(m)).length, "hydration/page errors;", msgs.length, "errors+warnings total");
    msgs.slice(0, 5).forEach((m) => console.log("   ", m));
    await p.close();
  }
  await b.close();
}
