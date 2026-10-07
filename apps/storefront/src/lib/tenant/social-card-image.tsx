import { readFile } from "node:fs/promises"
import path from "node:path"
import { ImageResponse } from "next/og"
import type { TenantBranding } from "./branding"
import {
  SOCIAL_CARD_SIZE,
  socialCardColors,
  socialCardFontSize,
  socialCardText,
} from "./social-card"

/**
 * The shop's card: its name on its own colour (t-2026-10-08-13). The face is
 * read from `public/`, next to the default pictures, because the image library
 * ships Latin glyphs only and a Russian name would otherwise be downloaded
 * glyph by glyph from a third party on every request.
 */
export const renderSocialCard = async (input: {
  shopName: string
  branding: Pick<TenantBranding, "primary_color" | "primary_foreground">
}): Promise<Response> => {
  const text = socialCardText(input.shopName)
  const font = await readFile(path.join(process.cwd(), "public/og/fonts/inter-600.ttf"))

  return new ImageResponse(
    (
      <div
        style={{
          ...socialCardColors(input.branding),
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 96,
          textAlign: "center",
          fontFamily: "Inter",
          fontWeight: 600,
          fontSize: text ? socialCardFontSize(text) : 0,
          lineHeight: 1.15,
        }}
      >
        {text}
      </div>
    ),
    {
      ...SOCIAL_CARD_SIZE,
      fonts: [{ name: "Inter", data: font, weight: 600, style: "normal" }],
    }
  )
}
