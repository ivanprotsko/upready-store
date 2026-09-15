// Variant of the f17 class one layer down: `sharp` IS in dependencies, so the
// JavaScript half installs. Its binary half ships as per-platform optional
// packages whose install runs a script, and the runtime stage passes
// --ignore-scripts, so the module resolves and then throws on first use.
import sharp from "sharp";

export async function POST(req: Request) {
  const body = Buffer.from(await req.arrayBuffer());
  return new Response(await sharp(body).resize(256).webp().toBuffer());
}
