# How the saved documentation pages under `../docs/` were produced

`dev.wildberries.ru` answers curl/WebFetch with HTTP 498 and `docs.ozon.ru` with a 307
redirect loop (`?__rr=1…5`) followed by 403. Playwright's own `launchPersistentContext`
with `channel: "chrome"` is detected as well — the measurement is kept in
`../docs/BLOCKED-by-antibot-playwright-launch-dev.wildberries.ru.txt` (HTTP 498, 17 characters
of body).

What works (the same finding as w01, `artifacts/docs/w01-wb-readonly-client/report.md`):
a Google Chrome started BY HAND with `--remote-debugging-port` and driven over CDP.

```sh
SP=<a scratch dir>
( exec nohup "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --remote-debugging-port=9333 --user-data-dir="$SP/chrome-cdp-profile" \
    --no-first-run --no-default-browser-check about:blank > "$SP/chrome.log" 2>&1 ) &
# wait for the socket, never for a name:
/usr/sbin/lsof -t -nP -iTCP:9333 -sTCP:LISTEN

NODE_PATH=/Users/ivanprotsko/upready/projects/upready-store/node_modules \
  node fetch-docs-cdp.cjs urls.json ../docs 9333

# stop it by PORT when done:
/usr/sbin/lsof -t -nP -iTCP:9333 -sTCP:LISTEN | xargs -r kill -9
```

`urls.json` is `[{ "url": "...", "file": "<host>-<path>.txt", "settleMs": 8000 }]`.
Each saved file carries the URL, the final URL, the HTTP status of the first response,
the page title and the save timestamp on its first lines; the link list of the page goes
to a sibling `*.links.txt`.

`parse-ozon.cjs` turns the saved Ozon page (one HTML page holding the WHOLE Seller API
reference) into `../docs/ozon-methods-index.tsv` — METHOD / PATH / SUMMARY / first line of
the description, 467 rows. The WB index `../docs/wb-methods-index.tsv` was built by the same
shape of parse over the WB pages (their renderer puts the path BEFORE the verb and inserts a
`Prod` marker between them, which is why the two parsers differ).

No marketplace API was called by this task: no key was loaded, and nothing here opens a
socket to `*.wildberries.ru` or `api-seller.ozon.ru`.
