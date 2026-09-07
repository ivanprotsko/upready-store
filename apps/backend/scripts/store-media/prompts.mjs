// Prompt assembly for the `sneakers` store profile, stage S4.
//
// Every string below is derived mechanically from
// `apps/backend/src/migration-scripts/data/profiles/sneakers/design/style-board.md`
// (§5.1 setup, §5.4 packshot template, §5.5 editorial template, §5.6 negative list,
// §6 hero and tile concepts). Nothing here is an aesthetic decision — the style board
// made those. This file only substitutes `{subject}` and folds the negative string in.
//
// WHY THE NEGATIVE STRING IS FOLDED INTO THE PROMPT: none of the three approved models
// (google/nano-banana-2, black-forest-labs/flux-2-pro, black-forest-labs/flux-1.1-pro-ultra)
// exposes a `negative_prompt` input — verified against each version's own openapi_schema
// on 2026-09-07. The style board says the negative string is "pasted verbatim alongside
// every render"; with no negative field, "alongside" is a `Do not include:` clause in the
// same prompt string. The board's text is carried through character for character.

// ---------------------------------------------------------------------------
// Negative strings — §5.4 and §5.5, verbatim.
// ---------------------------------------------------------------------------

export const PACKSHOT_NEGATIVE =
  'logo, logotype, brand name, brand mark, text, letters, numbers, typography, watermark, signature, swoosh, three stripes, trefoil, star, chevron, hangtag, price tag, label, sticker, shoe box, packaging, tissue paper, human, person, face, hands, arms, legs, feet, ankle, sock, mannequin, foot form, prop, plant, leaves, rock, gravel, sand, confetti, podium, plinth, pedestal, stool, table, mirror, reflection, water, wet floor, glossy floor, puddle, gradient background, coloured background, coloured gel, neon light, lens flare, bokeh, shallow depth of field, out of focus, motion blur, tilted horizon, dutch angle, top-down view, flat lay, overhead shot, pair of shoes, two shoes, left shoe, cartoon, illustration, sketch, 3d render, cgi, plastic look, low resolution, jpeg artifacts, noise, oversaturated, hdr, heavy vignette';

// v2 addition, footwear packshots only — the board's string above is carried through
// unchanged and these six terms are appended. They name the exact defect the smoke
// render produced (medial side, arch scoop, toe at frame-right); the board could not
// have anticipated it because it had not been measured yet. The still-life and
// editorial frames keep their board strings untouched: neither has a handedness.
export const PACKSHOT_NEGATIVE_V2 =
  `${PACKSHOT_NEGATIVE}, medial side, inner side of the shoe, visible arch cut-out, instep hollow, toe pointing to the right, heel on the left`;

export const EDITORIAL_NEGATIVE =
  'face, portrait, eyes, identifiable person, crowd, logo, brand name, shop sign, street sign, number plate, licence plate, poster, graffiti text, readable text, letters, numbers, watermark, signature, model release, studio background, white background, flat lay, product on white, hdr, oversaturated, teal and orange grade, heavy bloom, lens flare, motion blur, cartoon, illustration, 3d render, cgi, low resolution, jpeg artifacts';

// ---------------------------------------------------------------------------
// Template A — packshot, footwear. §5.4 verbatim, one placeholder.
// ---------------------------------------------------------------------------

// TEMPLATE REVISION v2, after the smoke render (hero-gutter-low, 2026-09-07).
//
// §5.4's own direction clause reads "toe rotated 30 degrees to the left of the lens
// axis, the outer lateral side facing the camera, heel visible". nano-banana-2 lost
// against its own bias and returned the MEDIAL (inner) side with the toe at frame-
// right — a right shoe, so §5.6(4) held, but the mirror of the camera clause §5.1
// commits to. The arch cut-away in the midsole waist is the tell, and it is exactly
// what a lens-axis instruction cannot fix: an image model has no lens axis to reason
// about. v2 says the same thing in frame coordinates ("toe at the left of the frame"),
// names the outer side in plain words, and forbids the arch scoop that gave it away.
// hero-gutter-low was rendered with v1 and is NOT re-rendered — Ivan, 2026-09-07.
// Its prompt survives verbatim in its own sidecar and in the manifest entry.
export function packshotBody(subject) {
  return (
    `Studio product photograph of ${subject} ` +
    'A single right shoe, alone in frame, in three-quarter front view seen from its outer side. ' +
    'The shoe points to the left: the toe is at the left of the frame and the heel is at the right of the frame. ' +
    'The camera sees the outer side wall of the shoe, the side away from the arch; the instep and its cut-away arch curve are on the far side, hidden from the camera. ' +
    'Seamless matte concrete-grey cyclorama background, flat mid-grey, one stop lighter at the top, no seam between floor and wall, no horizon. ' +
    'One large softbox key at 45 degrees camera-left and 30 degrees above, one narrow strip reflector camera-right at quarter power for edge separation on the dark upper, neutral 5600K daylight, no coloured light. ' +
    '85mm lens at f/8, camera positioned at midsole height so the shoe is seen very slightly from below, shoe centred and filling 80 percent of the frame width with clear space beneath the outsole. ' +
    'Exactly one soft feathered contact shadow directly under the outsole, no cast side shadow, no reflection, matte floor. ' +
    'Sharp focus across the entire shoe, front to back, material texture clearly visible. ' +
    'Square 1:1 composition. Clean commercial e-commerce packshot, unbranded, no markings.'
  );
}

// ---------------------------------------------------------------------------
// Template B — packshot, still life. Same room, same light, same lens, same
// negative string. Only the sentences that name a *shoe* are replaced.
//
// §5.4's template hard-codes "A single right shoe, alone in frame" after
// {subject}. That is right for the eleven footwear products and wrong for the
// three `care-and-spares` items (care-kit, flat-waxed-laces, round-waxed-laces),
// which are not shoes. Four spans differ from Template A and nothing else does:
//   1. the subject/pose sentence          -> {arrangement}, per product
//   2. "on the dark upper"                -> "along the dark edges of the subject"
//   3. camera clause: "at midsole height…the shoe…beneath the outsole"
//                                          -> low camera, group, beneath the group
//   4. "under the outsole" / "entire shoe" -> "under each object" / "entire group"
// ---------------------------------------------------------------------------

export function stillLifeBody(subject, arrangement) {
  return (
    `Studio product photograph of ${subject} ` +
    `${arrangement} ` +
    'Seamless matte concrete-grey cyclorama background, flat mid-grey, one stop lighter at the top, no seam between floor and wall, no horizon. ' +
    'One large softbox key at 45 degrees camera-left and 30 degrees above, one narrow strip reflector camera-right at quarter power for edge separation along the dark edges of the subject, neutral 5600K daylight, no coloured light. ' +
    '85mm lens at f/8, camera positioned low just above the ground plane so the objects are seen very slightly from below, the group centred and filling 80 percent of the frame width with clear space beneath it. ' +
    'Exactly one soft feathered contact shadow directly under each object, no cast side shadow, no reflection, matte floor. ' +
    'Sharp focus across the entire group, front to back, material texture clearly visible. ' +
    'Square 1:1 composition. Clean commercial e-commerce packshot, unbranded, no markings.'
  );
}

// The arrangement sentence for each of the three still-life products, written from
// that product's own `imageBrief.shots[0].description` in catalog/products.json.
export const STILL_LIFE_ARRANGEMENT = {
  'care-kit':
    'The three items together as a single still life, alone in frame and touching the same ground: the double-ended brush lying behind, the bottle standing centred, the folded cloth in front, seen from a low three-quarter front angle.',
  'flat-waxed-laces':
    'The coiled pair alone in frame, lying on the ground as one loose flat spiral with the four ends across the coil, seen from a low three-quarter front angle so the flat weave and the aglets are both readable.',
  'round-waxed-laces':
    'The three coils alone in frame, lying side by side on the same ground, each wound into its own separate loose spiral, seen from a low three-quarter front angle so the cord twist is readable in each.',
};

// ---------------------------------------------------------------------------
// Template C — editorial. §5.5 verbatim, one placeholder. Used for the 16:9
// home banner and the four 4:5 category tiles.
// ---------------------------------------------------------------------------

export function editorialBody(subject) {
  return (
    `Editorial street photograph, ${subject} ` +
    'Shot at 35mm, f/2.8, from standing eye height, on a city street at dusk under sodium and LED street lighting; damp asphalt, painted road markings, kerbstones and pavement edges in frame. ' +
    'Cool ambient light with one warm practical source. ' +
    'The frame is cropped below the shoulders — no face is visible and no person is identifiable. ' +
    'Natural grain, no HDR, restrained contrast, deep shadows retained. ' +
    'Composition leaves the left third quiet and low in detail so display type can sit over it.'
  );
}

// Editorial subjects, condensed from style-board §6.1 (banner) and §6.2 (tiles).
// The board's prose is the source; only sentence shape changed so it reads as the
// `{subject}` clause the template expects.
export const BANNER_SUBJECT =
  "a single walker's lower body crossing a wet city street at dusk, caught mid-stride with the leading foot just landing on the painted line of a crossing, the frame cut at the hips; the shoes are deep black with a small acid yellow-green heel tab catching the light, the only saturated colour in the picture; the damp asphalt holds a low broken reflection of the street lights, and kerbstones and the pavement edge run through the lower right; the left third of the frame is quiet, dark and empty.";

export const TILE_SUBJECTS = {
  'low-tops':
    'a seated figure on a kerb, cropped at the chest, feet flat on the asphalt and knees up, wearing concrete-grey low-top sneakers with an acid yellow-green eyelet row; a tall portrait composition that puts the shoes in the lower two thirds with the empty road above them.',
  'high-tops':
    'a figure stepping down off a kerbstone, cropped at the waist, one deep black high-top sneaker with an acid yellow-green heel tab caught in the air, its padded collar and the ankle clearly readable against a dark closed shopfront shutter behind.',
  runners:
    // §6.2 asks for "slight natural motion in the trailing foot"; the editorial
    // negative string forbids motion blur. Resolved in favour of the negative
    // string (which is pasted verbatim) by describing the POSE, not the blur.
    "a walker's legs crossing a painted road marking at pace, cropped at the thigh, the trailing foot just lifting off the asphalt while the whole frame stays sharp, wearing chalk off-white running shoes with an acid yellow-green line along the midsole; the brightest and most open frame of the four.",
  trail:
    'trail boots planted on broken kerbstone and loose gravel at the edge of the road where the pavement gives out, cropped at the knee, a dark blue-grey upper with an oxblood collar; the toughest and darkest frame of the four.',
};

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** Fold the negative string in as a trailing clause — see the header note. */
export function withNegative(body, negative) {
  return `${body}\n\nDo not include: ${negative}`;
}
