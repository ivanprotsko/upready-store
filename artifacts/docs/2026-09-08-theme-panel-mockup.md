# Theme settings panel (T0i) — ASCII mock-up of every state

Design stage for T0i of `docs/prompts/initial-prompt-2026-09-06-orchestrator-theme-presets-panel.md`,
written before any code (rule 27d). Canon: `~/upready/packages/geist-kit/AGENTS.md` — sentence case,
weight ≤ 600, one accent, Geist Mono + `tabular-nums` for numbers, hairline borders, status = 8 px dot
+ text. Style of the document follows `~/upready/projects/design-docs/docs/theme-configurator/06-ui-panel.md`.

Task `t-ds-0b-theme-presets-panel`. Storefront `apps/storefront`, mechanics through the existing
`src/lib/theme` only (`applyAxis` / `resetAxes` / `readCurrent`); no new axis is added today (rule 32a),
but the popover's section list is a loop over `AXES`, so T0j/T0k's `data-card` / `data-image-*` arrive as
array entries and not as a redesign.

## Facts this mock-up is drawn on (measured 2026-09-08, not remembered)

| Fact | Value | Where it came from |
|---|---|---|
| presets shipped | 7 | `src/lib/theme/presets.generated.ts` → `THEME_IDS` |
| canon tokens per preset per mode | 31 | `THEME_TOKEN_COUNT`, written by `scripts/build-themes.mjs` |
| modes | `light`, `dark` | `THEME_MODES` |
| axes registered | 2 (`data-theme`, `data-mode`) | `src/lib/theme/attributes.ts` → `AXES` |
| labels on screen | `THEME_LABELS` | ids never reach the screen (brief T0i.4) |
| brand elements to arm | 3 | nav `nav-store-link`, bottom-nav `/` link, checkout `store-link` |

Preset id → label, as the panel renders them (ids are in this table for the reader of this document,
never on screen):

```
sneakers        Kerbstone          supplements     Scruple
electronics     Ferrite            womens-fashion  Larchant
home-goods      Long Morning       geist           Geist
medusa          Medusa default     ( "default" is an alias of medusa )
```

## Language of the panel

English, like the rest of this repository's code, README and briefs. The panel is a developer tool that
a visitor never sees, so it is deliberately NOT wired into the 36 next-intl catalogs: the repo rule
"never hardcode a user-facing string" guards shop copy, and adding 36 translations of "Reset to default"
for a hidden tool is exactly the scope the day's rules tell us not to take (rule 32a). One sentence in
the component says the same thing to the next reader.

## Dialog primitive

Native `<dialog>` with `showModal()`: it brings the focus trap, `Esc`, the backdrop and inertness for
free, needs no portal and no dependency, and the storefront's own modal primitive
(`src/modules/common/components/modal`) is a Headless-UI transition sized for shop flows, dressed in
Medusa tokens — the wrong clothes for a tool that must look the same under all seven presets.

---

## S0 · Visitor, no cookie — the storefront as it is today

Nothing is added to the page: no button, no popover, no markup. The only difference from today is a
pointer listener on the brand element, which has no visual expression at all.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ☰   search              K E R B S T O N E              ⚲  us ▾   ♡   ⛒ 0       │  ← nav, unchanged
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│            [ hero ]                                                            │
│                                                                                │
│   ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐                               │
│   │ card   │  │ card   │  │ card   │  │ card   │                               │
│   └────────┘  └────────┘  └────────┘  └────────┘                               │
│                                                                                │
│                                                                                │
│                                                                                │  ← bottom-left: EMPTY
└────────────────────────────────────────────────────────────────────────────────┘
   curl -s http://localhost:8000/ | grep devtools-button   →   0 lines
```

## S1 · Press-and-hold on the brand, 0 → 2 s

No progress ring, no highlight, no cursor change: an affordance would advertise the door. The press is
armed on `pointerdown`, disarmed by `pointerup`, `pointercancel`, `pointerleave`, `scroll` or a move of
more than 10 px; only a press that survives 2000 ms opens the dialog.

```
t = 0.0 s   pointerdown on  K E R B S T O N E     nothing visible
t = 1.5 s   still down                            nothing visible
t = 1.5 s   pointerup                             ordinary navigation → "/"      ← short press stays a link
t = 2.0 s   timer fires                           dialog opens, navigation suppressed
            (the click that follows the long press is swallowed once, so the
             storefront does not navigate out from under the dialog)
```

## S2 · Password dialog — empty

The dialog wears the panel's own canon skin (`--elev` surface, hairline, `--r-lg`), 320 px wide,
centred, with a dimmed backdrop. One field, one button, one error line that occupies no height until
there is an error, so the dialog does not jump.

It is mounted only once a hold has fired. Rendering it up front put "Storefront devtools / Password /
Unlock" into the HTML of every visitor — measured on the stand with curl before this was changed —
which is markup nobody can use, advertising a door that is supposed to be invisible.

```
                    ┌──────────────────────────────────────┐
                    │ STOREFRONT DEVTOOLS                  │  ← eyebrow: mono 10px, .08em, --muted
                    │                                      │
                    │ Password                             │  ← label 12px --faint
                    │ ┌──────────────────────────────────┐ │
                    │ │ ••••••••                         │ │  ← input: --bg, hairline, --r-sm
                    │ └──────────────────────────────────┘ │     focus = border --ring, no glow
                    │                                      │
                    │                    ┌───────────────┐ │
                    │                    │    Unlock     │ │  ← primary: polarity flip
                    │                    └───────────────┘ │     bg --fg, text --bg, weight 500
                    │                                      │
                    │ Esc closes. Nothing is stored until  │  ← hint 12px --faint
                    │ the password checks out.             │
                    └──────────────────────────────────────┘
                     ▒▒▒▒▒▒ backdrop rgba(0,0,0,.55) ▒▒▒▒▒▒
```

## S3 · Password dialog — wrong password

The error is a sentence, not a code (rule 18e). The field keeps focus and its value is selected, so a
typo is one keystroke from fixed. No cookie is set; the button returns from its pending state.

```
                    ┌──────────────────────────────────────┐
                    │ STOREFRONT DEVTOOLS                  │
                    │                                      │
                    │ Password                             │
                    │ ┌──────────────────────────────────┐ │
                    │ │ ••••••••                         │ │  ← border --red, value selected
                    │ └──────────────────────────────────┘ │
                    │ ● That password does not match.      │  ← 8px dot --red + text 12px
                    │                    ┌───────────────┐ │
                    │                    │    Unlock     │ │
                    │                    └───────────────┘ │
                    └──────────────────────────────────────┘

  Server: POST /api/devtools/unlock  →  401   { "error": "invalid" }     Set-Cookie: none
  Server, when STOREFRONT_DEVTOOLS_PASSWORD is empty or unset  →  404    (feature does not exist)
```

## S4 · Right password — cookie set, button appears

The dialog closes, `router.refresh()` re-runs the server component that reads the cookie, and the
floating button fades in bottom-left. 40 × 40, `--r-md`, `--elev` surface, hairline border, one
monochrome sliders icon at stroke 1.5, 16 px. It sits above the mobile bottom-nav (`z-[70]`,
`bottom: 5rem` under `lg`, `bottom: 1rem` from `lg` up) so it never covers a shop control.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ☰   search              K E R B S T O N E              ⚲  us ▾   ♡   ⛒ 0       │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│            [ hero ]                                                            │
│                                                                                │
│   ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐                               │
│   │ card   │  │ card   │  │ card   │  │ card   │                               │
│   └────────┘  └────────┘  └────────┘  └────────┘                               │
│                                                                                │
│  ┌────┐                                                                        │
│  │ ⇄  │  ← 40×40, bottom-left, data-testid="devtools-button"                    │
│  └────┘                                                                        │
└────────────────────────────────────────────────────────────────────────────────┘
   Set-Cookie: upready_devtools=<exp>.<hmac>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800
```

## S5 · Popover open — the panel itself

288 px wide, anchored above the button, `--elev`, `--r-lg`, hairline + soft stacked shadow (dark mode
adds the inset white hairline instead of a heavier shadow). Sections are stacked, each with a 12 px
`--faint` label. Preset rows carry a 12 px swatch pair (page + ink of that preset in the current mode)
so the eye can tell Scruple from Larchant before reading; the active row carries a check, never a colour
change alone. Everything below the divider is a tool action, not a theme value.

```
   ┌────────────────────────────────────────────────┐
   │ STOREFRONT DEVTOOLS                       ✕    │  ← eyebrow mono 10px + close
   ├────────────────────────────────────────────────┤
   │ Preset                                         │  ← label 12px --faint
   │  ┌──────────────────────────────────────────┐  │
   │  │ ◧  Ferrite                               │  │  ← rows sorted by LABEL, not by id
   │  │ ◧  Geist                                 │  │
   │  │ ◧  Kerbstone                          ✓  │  │  ← active row: --secondary bg
   │  │ ◧  Larchant                              │  │
   │  │ ◧  Long Morning                          │  │
   │  │ ◧  Medusa default                        │  │
   │  │ ◧  Scruple                               │  │
   │  └──────────────────────────────────────────┘  │
   │                                                │
   │ Mode                                           │
   │  ┌─────────────────┬──────────────────────┐    │
   │  │     Light   ✓   │        Dark          │    │  ← segment: 2 buttons, one active
   │  └─────────────────┴──────────────────────┘    │
   │                                                │
   │ Rendered from 31 tokens of preset Kerbstone.   │  ← source line, mono tabular-nums for 31
   ├────────────────────────────────────────────────┤
   │  Reset to default            Lock              │  ← ghost buttons, hairline
   └────────────────────────────────────────────────┘
              ▲
            ┌────┐
            │ ⇄  │
            └────┘
```

Placement rule, written down because a popover is where positioning bugs live: the button and the
popover share ONE `position: fixed` root at the bottom-left corner; the popover is laid out inside it as
an ordinary block with `bottom: 100%`, so no ancestor's `transform`, `overflow` or `contain` can move it
and no script measures a rect. At widths under 360 px the popover's width becomes `calc(100vw - 2rem)`.

## S6 · Preset flip — instantly, no reload

One click calls `applyAxis("data-theme", id)` and nothing else: the module writes the attribute on
`<html>` and persists it in localStorage. The 31 CSS variables of the new preset take over, the bridge
carries them into every Medusa `--fg-*` / `--bg-*` variable, and the whole storefront — nav, cards,
footer, the panel's own SHOP-side surroundings — changes in the same frame. The panel itself does not
change, because it is dressed in the canon and not in the shop's theme.

```
   before: <html data-theme="sneakers"  data-mode="light">   nav ▓ ink on paper, cards warm grey
   click "Scruple"
   after:  <html data-theme="supplements" data-mode="light">  nav ▓ ink on cream, cards sand
           localStorage["upready-store.theme"] = "supplements"
           getComputedStyle(html).getPropertyValue("--background")  changed
           body background                                          changed
   the panel: same ink, same hairlines, same 14 px — unchanged by design
```

## S7 · Mode flip

```
   ┌─────────────────┬──────────────────────┐        ┌─────────────────┬──────────────────────┐
   │     Light   ✓   │        Dark          │   →    │     Light       │      Dark      ✓     │
   └─────────────────┴──────────────────────┘        └─────────────────┴──────────────────────┘
   <html data-mode="light">                          <html data-mode="dark">
   storefront: white page, black ink                 storefront: near-black page, light ink
   panel: light canon                                panel: dark canon (it follows the mode, not
                                                            the preset — same mode as the shop, so
                                                            the tool never glares in a dark room)
```

## S8 · Reset to default

`resetAxes()` — both storage keys removed, both attributes put back on their fallback. The rows and the
segment re-read `readCurrent()` and land on Medusa default / Light. The button and the cookie stay: reset
is about the look, lock is about access.

```
   Preset  ✓ Medusa default          Mode  ✓ Light
   localStorage["upready-store.theme"]  removed
   localStorage["upready-store.mode"]   removed
   <html data-theme="default" data-mode="light">
   Rendered from 31 tokens of preset Medusa default.
```

## S9 · Reload — no flash

The inline pre-paint script in `<head>` (already shipped, generated from `AXES`) applies the stored
choice before the first paint. The panel adds nothing here; this frame exists because the acceptance
asks for it.

```
   reload with localStorage["upready-store.theme"] = "supplements"

   ├ HTML arrives:        <html data-theme="default"     …>   (SSR, profile default)
   ├ <head> script runs:  <html data-theme="supplements" …>   ← BEFORE first paint
   ├ first paint:         Scruple                             ← no white flash of the default
   └ hydration:           unchanged (idempotent)
```

## S10 · Lock

`DELETE /api/devtools/unlock` clears the cookie, `router.refresh()` re-renders, and the page is S0 again:
the HTML that reaches the browser contains neither button nor popover.

```
   ┌────┐                                            (nothing)
   │ ⇄  │   →  Lock  →   Set-Cookie: upready_devtools=; Max-Age=0   →
   └────┘                                            bottom-left empty
```

## S11 · Mobile, 390 px

The brand element on mobile is the medusa mark in the bottom nav; the same 2 s hold opens the same
dialog. The floating button sits above the bottom nav, and the popover is full-width minus the margins.

```
┌──────────────────────────┐      ┌──────────────────────────┐
│ ☰  search   ⛒            │      │ ┌──────────────────────┐ │
│                          │      │ │ STOREFRONT DEVTOOLS ✕│ │
│   ┌──────┐  ┌──────┐     │      │ │ Preset               │ │
│   │ card │  │ card │     │      │ │ ◧ Kerbstone       ✓  │ │
│   └──────┘  └──────┘     │      │ │ ◧ Ferrite            │ │
│                          │      │ │ …                    │ │
│ ┌────┐                   │      │ │ Mode  [Light ✓][Dark]│ │
│ │ ⇄  │                   │      │ │ Rendered from 31 …   │ │
│ └────┘                   │      │ │ Reset to default Lock│ │
├──────────────────────────┤      │ └──────────────────────┘ │
│  ▤    ⚲    ◉    ☺    ⛒   │ ←hold├ ┌────┐                   │
└──────────────────────────┘  2 s │ │ ⇄  │                   │
                                  ├──────────────────────────┤
                                  │  ▤    ⚲    ◉    ☺    ⛒   │
                                  └──────────────────────────┘
```

## Canon compliance, line by line

| Canon rule | How this panel keeps it |
|---|---|
| sentence case | "Reset to default", "Rendered from 31 tokens of preset Kerbstone." Only the eyebrow is uppercase, and it is mono 10 px. |
| weight ≤ 600 | 400 body, 500 on the primary button and active rows. Nothing heavier. |
| one accent | Blue only on links and the focus ring; red only as the error dot. Preset rows use `--secondary`, not colour. |
| mono + tabular-nums for data | the "31" of the source line, and the eyebrow. |
| hairline borders | dialog, popover, button, input, segment, preset list — all 1 px `--border`. |
| status = 8 px dot + text | the error line in S3. |
| dark elevation = borders | dark popover: hairline + `inset 0 0 0 1px rgba(255,255,255,.04)`, no heavy drop. |
| no hardcoded hex in components | the 19 canon tokens live in one vendored CSS file scoped to the panel root; components name variables only. |

## Acceptance by eye (rule 27d — at least one human criterion, all of these are)

1. On all seven presets in both modes the panel looks the SAME: the shop changes around it, the tool does
   not change with it. Checked by flipping through every preset with the popover open.
2. A visitor cannot find the door: on `/` with no cookie, nothing in the corner, nothing in the nav, and
   the logo behaves as a link on a normal click.
3. The source line reads as a sentence, not as a log line: "Rendered from 31 tokens of preset Kerbstone."
   — no ids, no key names, the number in mono so it lines up when the preset changes.
4. The preset flip is instant to the eye — the whole page changes in one frame, with no white flash and
   no visible relayout of the panel.
5. A reload keeps the chosen preset and shows no flash of the default look, watched at normal speed on
   a cold reload.
