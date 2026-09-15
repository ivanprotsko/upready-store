import { chromium } from '/Users/ivanprotsko/upready/projects/upready-store/node_modules/playwright/index.mjs';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:600,height:600}});
await p.setContent(`<body style="margin:0;background:#E8177D;display:flex;align-items:center;justify-content:center;font:bold 48px sans-serif;color:#fff">ТЕСТ Q02</body>`);
await p.screenshot({path: process.argv[2]});
await b.close(); console.log('ok');
