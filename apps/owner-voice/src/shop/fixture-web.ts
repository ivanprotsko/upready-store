/**
 * A small public web for the evidence scenes and the tests: one product page
 * with three pictures at an https address. It never touches the network, so a
 * stand on fixtures can show «photo by link» offline. Only the page guard uses
 * it; the image drivers keep the real fetch.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { FetchFn } from "./api.ts";

const FILES = fileURLToPath(new URL("../../fixtures/files/", import.meta.url));

export const FIXTURE_PAGE = "https://shop.example/tovar/trojchatka";

const PAGE = `<!doctype html><html><head><title>Тройчатка</title>
<meta property="og:image" content="https://shop.example/img/page-1.png">
<script type="application/ld+json">{"@type":"Product","name":"Тройчатка","image":["https://shop.example/img/page-2.png"]}</script>
</head><body><main><h1>Тройчатка</h1><img src="/img/page-3.png" width="480" height="480" alt=""></main></body></html>`;

export const fixtureWeb: { fetch: FetchFn; lookup: (host: string) => Promise<string[]> } = {
  lookup: async () => ["93.184.216.34"],
  fetch: (async (input: Parameters<FetchFn>[0]) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url);
    if (url.hostname !== "shop.example") return new Response("not found", { status: 404 });
    if (url.pathname === "/tovar/trojchatka") return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
    const pic = /^\/img\/(page-[123]\.png)$/.exec(url.pathname);
    if (pic) return new Response(readFileSync(`${FILES}${pic[1]}`), { headers: { "content-type": "image/png" } });
    return new Response("not found", { status: 404 });
  }) as FetchFn,
};
