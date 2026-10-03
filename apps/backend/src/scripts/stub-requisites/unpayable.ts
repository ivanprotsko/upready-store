import { createHash } from "node:crypto";

/**
 * Requisites that look real and can never receive money (t-cherk-com-hotfix
 * batch 6, Ivan 03.10: «сделай заглушки разных банков»). Live buyers see the
 * stubs until the owner enters her own, so each value must FAIL the check its
 * system makes before money moves:
 * - a card number fails the Luhn check, so no bank form accepts it;
 * - a TRON address fails its base58check checksum, so no wallet sends to it;
 * - an EVM address is mixed case with a WRONG EIP-55 checksum, so wallets
 *   refuse it. Never the zero address or a burn address: those are valid, and
 *   money sent there is simply lost.
 *
 * Node has no Keccak-256 (its `sha3-256` is the NIST variant, a different
 * padding), so the EIP-55 check carries its own small Keccak below.
 */

// ---- Luhn -----------------------------------------------------------------

/** The Luhn check digit for a number without it. */
export const luhnCheckDigit = (body: string): number => {
  let sum = 0;
  const digits = body.split("").reverse();
  digits.forEach((char, index) => {
    let digit = Number(char);
    if (index % 2 === 0) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
  });
  return (10 - (sum % 10)) % 10;
};

export const passesLuhn = (number: string): boolean => {
  const digits = number.replace(/\D/g, "");
  return digits.length > 1 && luhnCheckDigit(digits.slice(0, -1)) === Number(digits.slice(-1));
};

/** A 16-digit card number from 15 digits, with the check digit made wrong on purpose, grouped by four. */
export const cardFailingLuhn = (first15: string): string => {
  if (!/^\d{15}$/.test(first15)) {
    throw new Error(`cardFailingLuhn: expected 15 digits, got "${first15}"`);
  }
  const wrong = (luhnCheckDigit(first15) + 5) % 10;
  return `${first15}${wrong}`.replace(/(\d{4})(?=\d)/g, "$1 ");
};

// ---- base58check (TRON) -------------------------------------------------------

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export const base58Encode = (bytes: Uint8Array): string => {
  let value = 0n;
  for (const byte of Array.from(bytes)) {
    value = (value << 8n) + BigInt(byte);
  }
  let out = "";
  while (value > 0n) {
    out = BASE58_ALPHABET[Number(value % 58n)] + out;
    value /= 58n;
  }
  for (const byte of Array.from(bytes)) {
    if (byte !== 0) {
      break;
    }
    out = `1${out}`;
  }
  return out;
};

export const base58Decode = (text: string): Uint8Array => {
  let value = 0n;
  for (const char of text) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit < 0) {
      throw new Error(`base58Decode: "${char}" is not base58`);
    }
    value = value * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  for (const char of text) {
    if (char !== "1") {
      break;
    }
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
};

const sha256d = (bytes: Uint8Array): Buffer =>
  createHash("sha256").update(createHash("sha256").update(bytes).digest()).digest();

/** Whether a TRON address carries the checksum of its own payload. */
export const tronChecksumValid = (address: string): boolean => {
  const bytes = base58Decode(address);
  if (bytes.length !== 25) {
    return false;
  }
  const payload = bytes.slice(0, 21);
  const checksum = Buffer.from(bytes.slice(21));
  return sha256d(payload).subarray(0, 4).equals(checksum);
};

/** A TRON-shaped address (0x41 + 20 bytes, base58, «T…» 34 chars) whose checksum is wrong. */
export const tronAddressFailingChecksum = (seed: string): string => {
  const body = createHash("sha256").update(`tron-stub:${seed}`).digest().subarray(0, 20);
  const payload = Buffer.concat([Buffer.from([0x41]), body]);
  const checksum = Buffer.from(sha256d(payload).subarray(0, 4));
  checksum[3] ^= 0xff;
  return base58Encode(Buffer.concat([payload, checksum]));
};

// ---- Keccak-256 and EIP-55 ---------------------------------------------------

const MASK64 = (1n << 64n) - 1n;

const ROUND_CONSTANTS = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

/** Rotation offsets r[x][y]. */
const ROTATIONS = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

const rotl = (value: bigint, shift: number): bigint =>
  shift === 0 ? value : ((value << BigInt(shift)) | (value >> BigInt(64 - shift))) & MASK64;

const keccakF = (state: bigint[]) => {
  for (const roundConstant of ROUND_CONSTANTS) {
    const c = [0, 1, 2, 3, 4].map((x) => state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20]);
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y++) {
        state[x + 5 * y] ^= d;
      }
    }
    const b: bigint[] = new Array(25).fill(0n);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(state[x + 5 * y], ROTATIONS[x][y]);
      }
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        state[x + 5 * y] = b[x + 5 * y] ^ (~b[((x + 1) % 5) + 5 * y] & MASK64 & b[((x + 2) % 5) + 5 * y]);
      }
    }
    state[0] ^= roundConstant;
  }
};

/** Keccak-256 (the Ethereum one: padding 0x01, not SHA3's 0x06), hex. */
export const keccak256Hex = (input: string): string => {
  const rate = 136;
  const message = Array.from(Buffer.from(input, "utf8"));
  message.push(0x01);
  while (message.length % rate !== 0) {
    message.push(0);
  }
  message[message.length - 1] |= 0x80;

  const state: bigint[] = new Array(25).fill(0n);
  for (let offset = 0; offset < message.length; offset += rate) {
    for (let lane = 0; lane < rate / 8; lane++) {
      let value = 0n;
      for (let byte = 7; byte >= 0; byte--) {
        value = (value << 8n) | BigInt(message[offset + lane * 8 + byte]);
      }
      state[lane] ^= value;
    }
    keccakF(state);
  }

  let hex = "";
  for (let lane = 0; lane < 4; lane++) {
    for (let byte = 0; byte < 8; byte++) {
      hex += Number((state[lane] >> BigInt(8 * byte)) & 0xffn)
        .toString(16)
        .padStart(2, "0");
    }
  }
  return hex;
};

/** The EIP-55 checksummed form of an address. */
export const toChecksumAddress = (address: string): string => {
  const lower = address.toLowerCase().replace(/^0x/, "");
  const hash = keccak256Hex(lower);
  return `0x${lower
    .split("")
    .map((char, index) => (/[a-f]/.test(char) && parseInt(hash[index], 16) >= 8 ? char.toUpperCase() : char))
    .join("")}`;
};

/** Mixed case that EIP-55 rejects: every letter's case flipped against the correct checksum. */
export const evmAddressFailingChecksum = (seed: string): string => {
  const lower = createHash("sha256").update(`evm-stub:${seed}`).digest("hex").slice(0, 40);
  if (!/[a-f]/.test(lower)) {
    throw new Error("evmAddressFailingChecksum: the seed gave an address with no letter to flip");
  }
  const valid = toChecksumAddress(lower);
  return `0x${valid
    .slice(2)
    .split("")
    .map((char) => (char === char.toLowerCase() ? char.toUpperCase() : char.toLowerCase()))
    .join("")}`;
};
