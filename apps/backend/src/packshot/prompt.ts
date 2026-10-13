/**
 * Prompt of the full re-render (`mode: "rerender"`, `fal-ai/nano-banana-pro/edit`),
 * ported from Packshot Studio (`lib/packshot/prompt.ts`, `DEFAULT_PROMPT_TEMPLATE`
 * and `QUALITY_BLOCK` verbatim).
 *
 * The placeholders are filled for one case only: white background, NO shadow, NO
 * reflection, one reference image. Ivan's tool produced reflections because its
 * template and its shadow reference image both asked for one. Here no reference
 * image goes with the source, the background block forbids both, and the pipeline
 * cuts the render out and draws the shadow itself (`shadow.ts`).
 *
 * There is no label OCR in this port, so the sentence that quoted the label text
 * asks the model to keep the text exactly as printed on image 1 instead.
 */

export const DEFAULT_PROMPT_TEMPLATE = `{REFS_INTRO}

Re-render the product from image 1 as a professional e-commerce packshot. Camera: perfectly frontal, straight-on at 0 degrees, lens at the vertical center of the product, shot from far away with a long telephoto lens (~135mm) so the perspective is flat and compressed like standard catalog photography. No tilt, no rotation, no wide-angle distortion, absolutely no low-angle view: the underside of the container must NOT be visible, the bottom edge of the product must be an almost perfectly straight horizontal line with only a barely perceptible curve — never a deep bulging ellipse. The main label panel must face the camera dead-center. The product itself stands perfectly vertical and upright, not leaning or tilted to any side.

The product: {CONTAINER_DESCRIPTION}.

{MATERIAL_RENDERING}

Keep the label design, colors, fonts and layout pixel-accurate. The label text must read EXACTLY, character by character, crisp and undistorted:
«{LABEL_TEXT}»
Text that wraps around the sides must stay partially visible at the edges exactly as printed. Do not invent, complete, translate or alter any characters anywhere on the product.

{BACKGROUND_BLOCK}

Leave generous empty white margins around the product: the product must occupy roughly the central 80% of the frame height for tall products or 80% of the frame width for wide products, fully visible, never cropped. Sharp focus, high-resolution product photography.`;

const LIGHTING =
  "Soft even studio lighting, identical across the whole series, no harsh cast shadows, no gradients, no color tint.";

const INTRO_ONE_IMAGE = "One reference image is provided: image 1 is the product.";

/** The `transparent` branch of Packshot Studio's `backgroundParts()`: pure white, no shadow, no reflection. */
export const BACKGROUND_BLOCK = `Pure solid uniform white background (#ffffff), NO shadow, NO reflection, NO gradient — the product floats on plain white. ${LIGHTING}`;

const FALLBACK_CONTAINER =
  "exactly the same container as in image 1 — same material, shape, proportions and cap";

export const QUALITY_BLOCK =
  "Re-light and re-materialize the product as a brand-new unit photographed in a professional studio. Replace ALL reflections and lighting inherited from the original photo with clean studio lighting: glossy surfaces (glass, plastic lids, metal caps) show ONLY soft vertical softbox highlights — never windows, room interiors, people or random bright patches. Remove ALL condition defects of the source photo: crumpled shrink film, wrinkled or lifted labels, creases, bubbles, scratches, dents, dust, fingerprints, stains, photo noise and JPEG artifacts. Every surface looks new and flawless: labels are perfectly flat, smoothly wrapped matte prints on clean white stock with crisp uniform ink; glass has uniform tint and realistic refraction; plastics are smooth injection-molded; metal caps show fine realistic ribbed or brushed texture. Neutral white color temperature, no yellow or blue cast. Keep the product's design identical: same shape, proportions, colors, label layout and graphics; preserve the original artwork style of any label illustrations (watercolor, line art, photos). The source is a marketplace listing photo that usually has promotional graphics composited on top as a separate layer — circular quantity or volume call-out badges (e.g. a red «750 мл» disc, «10 шт», «1 литр»), country-of-origin flag stickers (e.g. «сделано в России»), promo ribbons and seals (e.g. «премиум продукт»), price tags, arrows and site watermarks — that clearly float over the product or background and are NOT part of any printed label. Remove every such floating overlay, badge, sticker, ribbon, flag, call-out and watermark completely and never add any back. CRUCIAL: this removal applies ONLY to those floating marketing graphics. Every label physically printed on or glued to the package — the main front label AND any back or side label, including small print such as ingredients, composition, volume and manufacturer text — must be fully preserved, kept sharp and legible, and stay on the package; never blank out, empty, erase, simplify or relocate any package label or its text, and never push package text out onto the background. ALL genuinely printed text is redrawn cleanly and sharply — never invented, translated or altered.";

const LABEL_QUOTE = "The label text must read EXACTLY, character by character, crisp and undistorted:\n«{LABEL_TEXT}»";
const LABEL_AS_PRINTED =
  "The label text must read exactly as printed on the product in image 1, character by character, crisp and undistorted.";

/** The prompt sent with the source image. Replacement through functions keeps `$&` in any text literal. */
export const buildRerenderPrompt = (): string =>
  DEFAULT_PROMPT_TEMPLATE.replace(LABEL_QUOTE, () => LABEL_AS_PRINTED)
    .replaceAll("{REFS_INTRO}", () => INTRO_ONE_IMAGE)
    .replaceAll("{BACKGROUND_BLOCK}", () => BACKGROUND_BLOCK)
    .replaceAll("{MATERIAL_RENDERING}", () => QUALITY_BLOCK)
    .replaceAll("{CONTAINER_DESCRIPTION}", () => FALLBACK_CONTAINER);
