// node --test ui/report.test.mjs — структура отчёта воркера для UI проходит валидацию (приказ Ивана 2026-09-15 23:11 WITA)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReport } from './report-validate.mjs';
const ok = () => ({ task: 'b04-product-attributes', branch: 'feat/day16-product-attributes-fill', pr: { number: 59, url: 'https://github.com/ivanprotsko/upready-store/pull/59' },
  done: [{ item: 'Filled 115 attribute values for 38 products from metadata.full_characteristics', links: ['artifacts/b04-product-attributes/report.md'] }, { item: 'Backfill re-run is idempotent (to write = 0)' }],
  results: [{ label: 'PDP castor oil on the stand', url: 'http://cherkashino.localhost:8164/ru/products/castor-oil' }, { label: 'Backfill report', path: 'artifacts/b04-product-attributes/backfill-report.json' }],
  access: [{ url: 'http://localhost:9164/app', login: 'owner@example.com', password: 'stand-only-pass' }, { url: 'https://mt.upready.dev/app', login: 'owner@example.com', secretRef: '/opt/upready-store/mt/deploy/mt/shipshift.env' }],
  notes: ['8 of 38 products carry only an SKU — owner work in the panel'] });
test('valid report passes', () => assert.deepEqual(validateReport(ok()), []));
test('done and results are required and non-empty', () => { const r = ok(); delete r.done; r.results = []; const e = validateReport(r); assert.ok(e.some(x => x.startsWith('done:'))); assert.ok(e.some(x => x.startsWith('results:'))); });
test('a result needs url or path', () => { const r = ok(); r.results = [{ label: 'nowhere' }]; assert.ok(validateReport(r).some(x => /results\[0\]: url or path/.test(x))); });
test('access needs login and password or secretRef', () => { const r = ok(); r.access = [{ url: 'http://x.localhost', login: 'a' }]; assert.ok(validateReport(r).some(x => /access\[0\]: password .* or secretRef/.test(x))); r.access = [{ url: 'http://x.localhost', password: 'p' }]; assert.ok(validateReport(r).some(x => /access\[0\]\.login/.test(x))); });
test('links must be URLs or paths', () => { const r = ok(); r.done[0].links = ['see the panel']; assert.ok(validateReport(r).some(x => /done\[0\]\.links\[0\]/.test(x))); });
test('unknown fields are rejected', () => { const r = ok(); r.summary = 'x'; assert.ok(validateReport(r).some(x => /unknown field "summary"/.test(x))); });
test('non-object input is one clear error', () => assert.deepEqual(validateReport('nope'), ['report must be a JSON object']));
