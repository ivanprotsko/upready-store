#!/usr/bin/env node
// A stand-in for curl in the tests of deploy/auto and deploy/scripts (t-2026-10-12-30): no network.
//
// It reads the flags the scripts use (-sS -L -m -o -w -X -H [@file] --data and the URL) and answers from
// the routes in $FAKE_CURL_ROUTES, a JSON array tried in order:
//   {"method": "GET", "url": "<regex>", "status": 200, "json": {…}}   a JSON body
//   {"url": "<regex>", "file": "<path>"}                             the bytes of a file (a tarball)
//   {"url": "<regex>", "statuses": [502, 200]}                       one code per call, the last one repeats
//   {"url": "<regex>", "exit": 7}                                    curl's own failure, no answer
// No route: 404. Every call is one JSON line in $FAKE_CURL_LOG: method, url, data, and the Authorization
// header, so a test can check what was signed and that a token never reached an argument.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
let out = null;
let format = null;
let method = null;
let data = null;
let url = null;
const headers = [];
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === "-o") out = argv[++i];
  else if (a === "-w") format = argv[++i];
  else if (a === "-X") method = argv[++i];
  else if (a === "-m" || a === "--max-time") i += 1;
  else if (a === "--data" || a === "-d") data = argv[++i];
  else if (a === "-H") {
    const h = argv[++i];
    if (h.startsWith("@")) headers.push(...readFileSync(h.slice(1), "utf8").split("\n").filter(Boolean));
    else headers.push(h);
  } else if (/^https?:\/\//.test(a)) url = a;
}
method = method ?? (data === null ? "GET" : "POST");
const auth = headers.find((h) => /^authorization:/i.test(h)) ?? null;
const argsHoldAuth = argv.some((a) => /^authorization:/i.test(a));

const routes = process.env.FAKE_CURL_ROUTES ? JSON.parse(readFileSync(process.env.FAKE_CURL_ROUTES, "utf8")) : [];
const statePath = process.env.FAKE_CURL_STATE;
const state = statePath && existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
const index = routes.findIndex((r) => (!r.method || r.method === method) && new RegExp(r.url).test(url ?? ""));
const route = routes[index];

if (process.env.FAKE_CURL_LOG) {
  appendFileSync(process.env.FAKE_CURL_LOG, `${JSON.stringify({ method, url, data, auth, argsHoldAuth, route: index })}\n`);
}
if (route?.exit) process.exit(route.exit);

let status = 404;
let body = Buffer.from(JSON.stringify({ message: "Not Found (fake curl: no route)" }));
if (route) {
  status = route.status ?? 200;
  if (route.statuses) {
    const n = state[index] ?? 0;
    status = route.statuses[Math.min(n, route.statuses.length - 1)];
    state[index] = n + 1;
    if (statePath) writeFileSync(statePath, JSON.stringify(state));
  }
  if (route.file) body = readFileSync(route.file);
  else if ("json" in route) body = Buffer.from(JSON.stringify(route.json));
  else body = Buffer.from("");
}
if (out && out !== "/dev/null") writeFileSync(out, body);
else if (!out) process.stdout.write(body);
if (format) process.stdout.write(format.replace("%{http_code}", String(status)));
