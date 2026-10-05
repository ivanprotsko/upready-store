import { fromAtomicUnits, toAtomicUnits } from "../amount";
import { offeredX402Networks, x402ExplorerUrl, x402MainnetAvailable, x402NetworkById, X402_MAINNET_FLAG } from "../networks";
import { checkedEvmAddress, keccak256Hex, toChecksumAddress } from "../eip55";

/** Amounts, networks and the checksum of the receiving address (t-2026-10-03-33). */

describe("USDC amounts", () => {
  it.each([
    [25.5, "25500000"],
    ["25.50", "25500000"],
    [0.1 + 0.2, "300000"],
    [1050, "1050000000"],
    [{ numeric: 12.34 }, "12340000"],
  ])("%p USD is %s atomic units", (amount, atomic) => {
    expect(toAtomicUnits(amount, 6)).toBe(atomic);
  });

  it.each([0, -1, Number.NaN, "", "abc", null, 1e12])("refuses %p", (amount) => {
    expect(toAtomicUnits(amount, 6)).toBeNull();
  });

  it("prints atomic units back with at least two decimals", () => {
    expect(fromAtomicUnits("25500000", 6)).toBe("25.50");
    expect(fromAtomicUnits("1", 6)).toBe("0.000001");
    expect(fromAtomicUnits("1050000000", 6)).toBe("1050.00");
  });
});

describe("networks", () => {
  it("offers Base Sepolia always and Base only with the mainnet switch at exactly true", () => {
    expect(offeredX402Networks({}).map((network) => network.id)).toEqual(["eip155:84532"]);
    expect(offeredX402Networks({ [X402_MAINNET_FLAG]: "1" }).map((network) => network.id)).toEqual(["eip155:84532"]);
    expect(offeredX402Networks({ [X402_MAINNET_FLAG]: "true" }).map((network) => network.id)).toEqual([
      "eip155:84532",
      "eip155:8453",
    ]);
    expect(x402MainnetAvailable({})).toBe(false);
  });

  it("keeps each USDC's own EIP-712 name, as the reference implementation lists them", () => {
    expect(x402NetworkById("eip155:84532")?.usdc.name).toBe("USDC");
    expect(x402NetworkById("eip155:8453")?.usdc.name).toBe("USD Coin");
    expect(x402NetworkById("base-sepolia")).toBeNull();
  });

  it("links a transaction hash to its explorer, nothing else", () => {
    const hash = `0x${"ab".repeat(32)}`;
    expect(x402ExplorerUrl("eip155:84532", hash)).toBe(`https://sepolia.basescan.org/tx/${hash}`);
    expect(x402ExplorerUrl("eip155:8453", hash)).toBe(`https://basescan.org/tx/${hash}`);
    expect(x402ExplorerUrl("eip155:1", hash)).toBeNull();
    expect(x402ExplorerUrl("eip155:84532", "javascript:alert(1)")).toBeNull();
  });
});

describe("EIP-55", () => {
  it("hashes with Keccak-256, not NIST SHA3-256", () => {
    const enc = (text: string) => new TextEncoder().encode(text);
    expect(keccak256Hex(enc(""))).toBe("c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
    expect(keccak256Hex(enc("abc"))).toBe("4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
    expect(keccak256Hex(enc("The quick brown fox jumps over the lazy dog"))).toBe(
      "4d741b6f1eb29cb2a9b9911c82f56fa8d73b04959d3d9d222895df6c0b28aa15",
    );
  });

  // The EIP's own examples, and the two USDC contracts from the x402 reference.
  it.each([
    "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
    "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
    "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB",
    "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb",
    "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  ])("checksums %s", (address) => {
    expect(toChecksumAddress(address.toLowerCase())).toBe(address);
    expect(checkedEvmAddress(address)).toBe(address);
  });

  it("takes an all-lower or all-upper address as written, in checksummed form", () => {
    expect(checkedEvmAddress("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed")).toBe("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
    expect(checkedEvmAddress("0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED")).toBe("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
  });

  it("refuses a mixed-case address whose case contradicts the checksum, and anything that is not an address", () => {
    expect(checkedEvmAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD")).toBeNull();
    expect(checkedEvmAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeA")).toBeNull();
    expect(checkedEvmAddress("5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed")).toBeNull();
  });
});
