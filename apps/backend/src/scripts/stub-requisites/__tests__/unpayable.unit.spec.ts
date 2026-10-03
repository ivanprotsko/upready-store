import {
  cardFailingLuhn,
  evmAddressFailingChecksum,
  keccak256Hex,
  passesLuhn,
  toChecksumAddress,
  tronAddressFailingChecksum,
  tronChecksumValid,
} from "../unpayable";
import { STUB_REQUISITES } from "../stubs";

describe("unpayable stub values", () => {
  it("computes Keccak-256 and EIP-55 like Ethereum does (known vectors)", () => {
    expect(keccak256Hex("")).toBe("c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
    expect(toChecksumAddress("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed")).toBe(
      "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
    );
    expect(toChecksumAddress("0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359")).toBe(
      "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
    );
  });

  it("checks Luhn and TRON base58check against real-world valid values", () => {
    expect(passesLuhn("4111 1111 1111 1111")).toBe(true);
    expect(tronChecksumValid("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")).toBe(true);
  });

  it("makes a card number that fails Luhn and a TRON address that fails its checksum", () => {
    const card = cardFailingLuhn("440043000000123");
    expect(card).toMatch(/^\d{4} \d{4} \d{4} \d{4}$/);
    expect(passesLuhn(card)).toBe(false);

    const tron = tronAddressFailingChecksum("x");
    expect(tron).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
    expect(tronChecksumValid(tron)).toBe(false);
  });

  it("makes a mixed-case EVM address whose EIP-55 checksum is wrong, never the zero address", () => {
    const address = evmAddressFailingChecksum("x");
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(address).not.toBe(toChecksumAddress(address));
    expect(address.toLowerCase()).not.toBe(address);
    expect(address.toUpperCase().slice(2)).not.toBe(address.slice(2));
    expect(/^0x0+$/.test(address)).toBe(false);
  });

  it("every stub in the list is unpayable and marked DEMO", () => {
    for (const item of STUB_REQUISITES) {
      if (item.kind === "bank") {
        expect(passesLuhn(item.number)).toBe(false);
        expect(item.holder).toBe("DEMO");
      } else if (item.network === "TRC20") {
        expect(tronChecksumValid(item.address)).toBe(false);
      } else {
        expect(item.address).not.toBe(toChecksumAddress(item.address));
      }
    }
  });
});
