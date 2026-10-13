# Template fonts: licences

The woff2 files in this folder are the fonts a store template may name in `theme.fontPair`
(`apps/storefront/src/lib/templates/fonts.ts`), declared by `fonts.css` beside them. They come from
the 16.09 templates lab, `artifacts/docs/store-templates-lab/assets/fonts` (commit 2dc99d85), whose
`fonts.mjs` took them from Google Fonts, Latin and Cyrillic subsets only. The lab kept 400, 500 and 600
of a variable family as three copies of the same bytes; here each family has one file per subset,
plus the ruble sign below.
IBM Plex Mono has no variable axis and keeps its 400 and 500 files.

Every family is under the **SIL Open Font License 1.1** ([SIL Open Font License](https://openfontlicense.org)).
The table quotes each file's own `name` table: the copyright notice is name ID 0, the licence URL
name ID 14 (Google's subsets drop the licence text of name ID 13 and keep the URL). Read on 13.10.2026,
t-2026-10-12-33.

| Family | Files | Version (name ID 5) | Copyright (name ID 0), verbatim | Licence URL (name ID 14), verbatim |
|---|---|---|---|---|
| Cormorant Garamond | `cormorant-garamond-{latin,cyrillic}.woff2` | 4.001 | `Copyright 2015 The Cormorant Project Authors (github.com/CatharsisFonts/Cormorant)` | `openfontlicense.org` (https) |
| Geist | `geist-{latin,cyrillic}.woff2` | 1.800 | `Copyright 2024 The Geist Project Authors (github.com/vercel/geist-font)` | `openfontlicense.org` (https) |
| IBM Plex Mono | `ibm-plex-mono-{400,500}-{latin,cyrillic}.woff2` | 2.3 | `Copyright 2017 IBM Corp. All rights reserved.` | `scripts.sil.org/OFL` (http) |
| IBM Plex Sans | `ibm-plex-sans-{latin,cyrillic}.woff2` | 3.201 | `Copyright 2019 IBM Corp. All rights reserved.` | `scripts.sil.org/OFL` (http) |
| Inter | `inter-{latin,cyrillic}.woff2` | 4.001 | `Copyright 2016 The Inter Project Authors (github.com/rsms/inter)` | `openfontlicense.org` (https) |
| Manrope | `manrope-{latin,cyrillic}.woff2` | 4.504 | `Copyright 2019 The Manrope Project Authors (github.com/sharanda/manrope)` | `scripts.sil.org/OFL` (http) |
| Nunito | `nunito-{latin,cyrillic}.woff2` | 3.602 | `Copyright 2014 The Nunito Project Authors (github.com/googlefonts/nunito)` | `scripts.sil.org/OFL` (https) |
| Playfair Display | `playfair-display-{latin,cyrillic}.woff2` | 1.203 | `Copyright 2017 The Playfair Display Project Authors (github.com/clauseggers/Playfair-Display), with Reserved Font Name "Playfair Display".` | `scripts.sil.org/OFL` (http) |

The copyright column drops the `https://` the files write before their repository addresses; the rest
is as the files have it. The files are served unmodified, so the Reserved Font Name of Playfair Display
does not come into play.

## The ruble sign (`*-ruble.woff2`)

The lab's Latin and Cyrillic subsets leave out U+20BD, so a price set in a template face drew its ₽
from the fallback (t-2026-10-12-33 T0c). Each `*-ruble.woff2` holds U+20BD alone (and the space every
subset keeps), cut by Google Fonts itself from the same release as the files above: one request per
family to its CSS API with `text=₽`, made once outside the repository on 13.10.2026, e.g.
`https://fonts.googleapis.com/css2?family=Inter:wght@100..900&text=%E2%82%BD`, and the woff2 it
links saved unmodified. No tool was added to the repository. Each file carries the same version
(name ID 5), weight axis, copyright (name ID 0) and licence URL (name ID 14) as the family's rows in
the table above.

| Family | File | Weight | Version (name ID 5) |
|---|---|---|---|
| Cormorant Garamond | `cormorant-garamond-ruble.woff2` | 300–700 | 4.001 |
| Geist | `geist-ruble.woff2` | 100–900 | 1.800 |
| IBM Plex Mono | `ibm-plex-mono-{400,500}-ruble.woff2` | 400, 500 | 2.3 |
| IBM Plex Sans | `ibm-plex-sans-ruble.woff2` | 100–700 | 3.201 |
| Inter | `inter-ruble.woff2` | 100–900 | 4.001 |
| Manrope | `manrope-ruble.woff2` | 200–800 | 4.504 |
| Nunito | `nunito-ruble.woff2` | 200–1000 | 3.602 |

Playfair Display has no ruble sign: its Google Fonts release, `ofl/playfairdisplay/PlayfairDisplay[wght].ttf`
(1.203), maps no glyph to U+20BD (its currency signs are € and ₹), and the CSS API answers 400 to
`text=₽`. A price set in it keeps the fallback's ₽.

Four of the twelve `FONT_NAMES` have no file here: DM Sans, Space Grotesk, Fraunces and Sora carry no
Cyrillic (the lab's measurement of 16.09, `artifacts/docs/store-templates-lab/README.md`), so the lab
did not take them. A template that names one of them keeps `fonts.loaded` false and gets no
`data-font-pair`.
