import type { LoaderFunctionArgs } from "react-router"
import { API_MEDIA_PATH } from "~/lib/media"
import { openMedia, requireSession } from "~/lib/store-api.server"

/**
 * `/app/_media?src=<path>`: a lesson's video, poster or file. The backend's
 * media route checks the buyer's access and needs their token, which only
 * this server holds; the browser gets the route's redirect to the file. Only
 * paths of that route are accepted, so this is no open proxy to the API.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const src = new URL(request.url).searchParams.get("src") ?? ""

  if (!API_MEDIA_PATH.test(src)) {
    return new Response("", { status: 404 })
  }

  return openMedia(requireSession(request), src)
}
