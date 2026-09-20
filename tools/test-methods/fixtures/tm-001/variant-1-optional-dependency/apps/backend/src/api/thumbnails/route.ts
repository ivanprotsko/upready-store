// Variant of the f17 class: the package is declared, but under
// optionalDependencies. `npm install` skips it silently when its build fails
// on the image's platform, and the route that imports it at module scope takes
// the whole boot down.
import { createCanvas } from "canvas";

export async function GET() {
  const canvas = createCanvas(64, 64);
  return new Response(canvas.toBuffer());
}
