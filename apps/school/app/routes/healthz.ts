// The container's health check (deploy/compose.mt.yml, service `school`).
// The proxy never routes `/healthz` to this app, so only Docker sees it.
export function loader() {
  return new Response("ok", { headers: { "content-type": "text/plain", "cache-control": "no-store" } })
}
