import type { LoaderFunctionArgs } from "react-router"
import { fixtureMedia } from "~/lib/fixture.server"

/** The fixture stand's covers, pictures, files and videos (`lib/fixture.server.ts`); 404 everywhere else. */
export function loader({ request, params }: LoaderFunctionArgs) {
  return fixtureMedia(params["*"] ?? "", request)
}
