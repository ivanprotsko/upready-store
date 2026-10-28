/**
 * Two small PDFs for the tests and the screens, built here so the repository
 * holds the recipe and not only the bytes:
 *
 *   - `price.pdf`: a supplier's price list in Russian. A simple font whose
 *     codes map to Cyrillic through a ToUnicode CMap, the content stream Flate
 *     compressed, the way word processors write it;
 *   - `scan.pdf`: one page that only draws a picture, as a scanner writes it.
 *
 * `node scripts/pdf-fixtures.ts` writes both to `fixtures/files/`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const hex4 = (n: number) => n.toString(16).padStart(4, "0").toUpperCase();
const hex2 = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();

/** Objects in order from 1; a stream object is `[dict, bytes]`. */
function assemble(objects: (string | [string, Uint8Array])[]): Uint8Array {
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  const offsets: number[] = [];
  let size = parts[0]!.length;
  objects.forEach((obj, i) => {
    offsets.push(size);
    const chunk =
      typeof obj === "string"
        ? Buffer.from(`${i + 1} 0 obj\n${obj}\nendobj\n`, "latin1")
        : Buffer.concat([
            Buffer.from(`${i + 1} 0 obj\n${obj[0].replace("LEN", String(obj[1].length))}\nstream\n`, "latin1"),
            Buffer.from(obj[1]),
            Buffer.from("\nendstream\nendobj\n", "latin1"),
          ]);
    parts.push(chunk);
    size += chunk.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`, "latin1"));
  return new Uint8Array(Buffer.concat(parts));
}

/** A one-page PDF with these lines of text, any script. */
export function textPdf(lines: string[]): Uint8Array {
  const chars = [...new Set(lines.join(""))];
  const code = new Map(chars.map((c, i) => [c, 0x21 + i]));
  const cmap = [
    "/CIDInit /ProcSet findresource begin 12 dict begin begincmap",
    "/CMapName /Fixture def /CMapType 2 def",
    "1 begincodespacerange <00> <FF> endcodespacerange",
    `${chars.length} beginbfchar`,
    ...chars.map((c) => `<${hex2(code.get(c)!)}> <${hex4(c.charCodeAt(0))}>`),
    "endbfchar endcmap CMapName currentdict /CMap defineresource pop end end",
  ].join("\n");
  const content = [
    "BT /F1 14 Tf 56 780 Td 18 TL",
    ...lines.map((line, i) => `${i ? "T* " : ""}<${[...line].map((c) => hex2(code.get(c)!)).join("")}> Tj`),
    "ET",
  ].join("\n");
  return assemble([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    ["<< /Length LEN /Filter /FlateDecode >>", new Uint8Array(deflateSync(content))],
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /ToUnicode 6 0 R >>",
    ["<< /Length LEN >>", new TextEncoder().encode(cmap)],
  ]);
}

/** A one-page PDF that only draws a grey picture: no text layer. */
export function scanPdf(): Uint8Array {
  const pixels = new Uint8Array(64 * 64).fill(0xc8);
  return assemble([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>",
    ["<< /Length LEN >>", new TextEncoder().encode("q 595 0 0 842 0 0 cm /Im1 Do Q")],
    ["<< /Type /XObject /Subtype /Image /Width 64 /Height 64 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length LEN /Filter /FlateDecode >>", new Uint8Array(deflateSync(pixels))],
  ]);
}

export const PRICE_LINES = [
  "Прайс-лист поставщика «Алтай-Травы», ноябрь 2026",
  "Тройчатка Евдокименко, 100 мл — 640 ₽, было 590 ₽",
  "Мумиё алтайское, 30 таблеток — 410 ₽",
  "Мазь конский каштан, 75 мл — 285 ₽",
  "Менеджер: Ольга, olga.travy@example.com, +7 913 555-12-34",
  "Доставка от 15 000 ₽ бесплатно. Цены действуют до 30.11.2026.",
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = fileURLToPath(new URL("../fixtures/files/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}price.pdf`, textPdf(PRICE_LINES));
  writeFileSync(`${dir}scan.pdf`, scanPdf());
  console.log(`wrote ${dir}price.pdf and scan.pdf`);
}
