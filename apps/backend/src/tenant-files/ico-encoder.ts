/**
 * A minimal ICO writer (t-2026-10-03-61). `sharp` reads `.ico` but never
 * writes one, and Windows has read PNG-compressed icon frames since Vista
 * (MS-ICO), so this skips the classic BMP/AND-mask DIB encoding entirely:
 * one ICONDIRENTRY per frame, pointing at that frame's own PNG bytes.
 */

import { MedusaError } from "@medusajs/framework/utils";

export type IcoFrame = { size: number; png: Buffer };

const ICONDIR_SIZE = 6;
const ICONDIRENTRY_SIZE = 16;

/** `width`/`height` are one byte each; 256 wraps to the ICO format's own 0. */
const dimensionByte = (size: number): number => (size >= 256 ? 0 : size);

export const encodeIco = (frames: IcoFrame[]): Buffer => {
  if (frames.length === 0) {
    throw new MedusaError(MedusaError.Types.INVALID_ARGUMENT, "encodeIco needs at least one frame");
  }

  const header = Buffer.alloc(ICONDIR_SIZE);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(frames.length, 4);

  const directory = Buffer.alloc(ICONDIRENTRY_SIZE * frames.length);
  let offset = ICONDIR_SIZE + directory.length;

  frames.forEach((frame, index) => {
    const entry = directory.subarray(index * ICONDIRENTRY_SIZE, (index + 1) * ICONDIRENTRY_SIZE);
    entry.writeUInt8(dimensionByte(frame.size), 0); // width
    entry.writeUInt8(dimensionByte(frame.size), 1); // height
    entry.writeUInt8(0, 2); // colour count, unused for a PNG frame
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(frame.png.length, 8); // bytes in this frame
    entry.writeUInt32LE(offset, 12); // offset from the start of the file
    offset += frame.png.length;
  });

  return Buffer.concat([header, directory, ...frames.map((frame) => frame.png)]);
};
