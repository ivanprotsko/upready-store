/**
 * EIP-55 checksummed addresses (t-2026-10-03-33), for the one address a shop
 * types by hand: `pay_to`, where its USDC arrives. A typo there sends money to
 * an address nobody holds, and no one can bring it back. EIP-55 encodes a
 * checksum in the letter case of the hex digits, so a mixed-case address with
 * one wrong character is caught before it is saved.
 *
 * The checksum is Keccak-256 (the original Keccak padding, not NIST SHA3-256,
 * which Node's `crypto` offers and which gives a different digest), and no
 * hashing package is a dependency here, so the permutation is written out
 * below: one hash of 40 bytes per saved address, in BigInt lanes for clarity
 * rather than speed. Checked against the empty-string and "abc" digests and
 * the EIP's own example addresses in `__tests__/eip55.unit.spec.ts`.
 */

const MASK = (1n << 64n) - 1n;

const ROUND_CONSTANTS = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

/** Rotation offsets, `ROTATIONS[x][y]`. */
const ROTATIONS = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

const rotl = (value: bigint, shift: number): bigint =>
  shift === 0 ? value : ((value << BigInt(shift)) | (value >> BigInt(64 - shift))) & MASK;

/** Keccak-f[1600] on 25 lanes, `state[x + 5 * y]`, in place. */
const permute = (state: bigint[]): void => {
  for (const constant of ROUND_CONSTANTS) {
    const c = [0, 1, 2, 3, 4].map((x) => state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20]);
    for (let x = 0; x < 5; x += 1) {
      const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] ^= d;
      }
    }
    const b = new Array<bigint>(25).fill(0n);
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(state[x + 5 * y], ROTATIONS[x][y]);
      }
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] = b[x + 5 * y] ^ (~b[((x + 1) % 5) + 5 * y] & MASK & b[((x + 2) % 5) + 5 * y]);
      }
    }
    state[0] ^= constant;
  }
};

const RATE_BYTES = 136;

/** Keccak-256 of `input`, as 64 lower-case hex digits. */
export const keccak256Hex = (input: Uint8Array): string => {
  const padded = new Uint8Array(Math.ceil((input.length + 1) / RATE_BYTES) * RATE_BYTES);
  padded.set(input);
  padded[input.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;

  const state = new Array<bigint>(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += RATE_BYTES) {
    for (let lane = 0; lane < RATE_BYTES / 8; lane += 1) {
      let value = 0n;
      for (let byte = 7; byte >= 0; byte -= 1) {
        value = (value << 8n) | BigInt(padded[offset + lane * 8 + byte]);
      }
      state[lane] ^= value;
    }
    permute(state);
  }

  let hex = "";
  for (let lane = 0; lane < 4; lane += 1) {
    for (let byte = 0; byte < 8; byte += 1) {
      hex += Number((state[lane] >> BigInt(8 * byte)) & 0xffn)
        .toString(16)
        .padStart(2, "0");
    }
  }
  return hex;
};

/** The EIP-55 form of a 0x-prefixed 40-digit hex address, whatever case it came in. */
export const toChecksumAddress = (address: string): string => {
  const lower = address.slice(2).toLowerCase();
  const hash = keccak256Hex(new TextEncoder().encode(lower));
  let out = "0x";
  for (let i = 0; i < lower.length; i += 1) {
    out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
};

/**
 * The address in EIP-55 form, or `null` when it is not an address or its
 * mixed case contradicts its checksum. An all-lower or all-upper address
 * carries no checksum and is taken as written.
 */
export const checkedEvmAddress = (raw: string): string | null => {
  const value = raw.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    return null;
  }
  const body = value.slice(2);
  const checksummed = toChecksumAddress(value);
  if (body !== body.toLowerCase() && body !== body.toUpperCase() && checksummed !== value) {
    return null;
  }
  return checksummed;
};
