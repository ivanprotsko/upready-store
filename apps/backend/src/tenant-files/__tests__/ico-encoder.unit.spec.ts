import { encodeIco } from "../ico-encoder";

describe("encodeIco", () => {
  it("writes the ICONDIR header: reserved 0, type 1, one entry per frame", () => {
    const ico = encodeIco([
      { size: 16, png: Buffer.from("frame-16") },
      { size: 32, png: Buffer.from("frame-32") },
    ]);

    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(2);
  });

  it("points each directory entry at its own frame's bytes, in order", () => {
    const frames = [
      { size: 16, png: Buffer.from("a".repeat(10)) },
      { size: 32, png: Buffer.from("b".repeat(20)) },
      { size: 48, png: Buffer.from("c".repeat(30)) },
    ];
    const ico = encodeIco(frames);

    frames.forEach((frame, index) => {
      const entry = ico.subarray(6 + index * 16, 6 + (index + 1) * 16);
      expect(entry.readUInt8(0)).toBe(frame.size); // width
      expect(entry.readUInt8(1)).toBe(frame.size); // height
      expect(entry.readUInt16LE(4)).toBe(1); // planes
      expect(entry.readUInt16LE(6)).toBe(32); // bit count
      expect(entry.readUInt32LE(8)).toBe(frame.png.length);

      const dataOffset = entry.readUInt32LE(12);
      expect(ico.subarray(dataOffset, dataOffset + frame.png.length)).toEqual(frame.png);
    });
  });

  it("wraps a 256px dimension to the ICO format's own 0 byte", () => {
    const ico = encodeIco([{ size: 256, png: Buffer.from("full-size") }]);
    const entry = ico.subarray(6, 22);

    expect(entry.readUInt8(0)).toBe(0);
    expect(entry.readUInt8(1)).toBe(0);
  });

  it("throws rather than write an empty, unreadable icon", () => {
    expect(() => encodeIco([])).toThrow();
  });
});
