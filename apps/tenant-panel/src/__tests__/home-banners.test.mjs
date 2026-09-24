import { test } from "node:test"
import assert from "node:assert/strict"

import {
  BANNERS_MAX,
  BANNER_TEXT_MAX,
  DEFAULT_DOCUMENT,
  isAllowedBannerHref,
} from "../routes/home-settings/composition.ts"

// t-2026-09-24-n15: the panel's twin of the backend's banner rules
// (`api/tenants/home/validators.ts`) — the same href rule, the same caps, and a
// default document that already carries an empty banner list so the editor never
// reads `undefined`.

test("href rule matches the backend: http(s) or a site path, nothing else", () => {
  for (const ok of ["https://example.com/a?b=1", "http://localhost:8233/ru", "/ru/store", "/"]) {
    assert.equal(isAllowedBannerHref(ok), true, ok)
  }
  for (const bad of ["javascript:alert(1)", "//evil.example", "ftp://x", "store", "", " /x"]) {
    assert.equal(isAllowedBannerHref(bad), false, bad)
  }
})

test("caps are the backend's", () => {
  assert.equal(BANNER_TEXT_MAX, 60)
  assert.equal(BANNERS_MAX, 10)
})

test("the default document starts with no banners", () => {
  assert.deepEqual(DEFAULT_DOCUMENT.content.banners, [])
})
