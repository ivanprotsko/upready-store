/**
 * The networks an x402 payment can travel on (t-2026-10-03-33), one entry per
 * CAIP-2 id the x402 V2 protocol names them by.
 *
 * Only USDC on Base for now, the pair the x402 reference implementation ships
 * defaults for (`typescript/packages/mechanisms/evm/src/shared/defaultAssets.ts`
 * in coinbase/x402, read 2026-10-05). The token's EIP-712 domain `name` differs
 * between the two networks ("USDC" on Base Sepolia, "USD Coin" on Base), and a
 * wrong one makes every signature fail verification, so it lives here next to
 * the address it belongs to rather than being guessed anywhere else.
 *
 * Base Sepolia is a test network: its USDC is worthless. Base is real money,
 * offered only where `X402_MAINNET_AVAILABLE` is exactly `true`
 * (`x402MainnetAvailable`), so no shop takes real USDC until the operator of
 * the instance switches it on.
 */
export type X402NetworkId = "eip155:84532" | "eip155:8453";

export type X402Network = {
  id: X402NetworkId;
  chainId: number;
  label: string;
  testnet: boolean;
  usdc: {
    address: string;
    /** EIP-712 domain `name` of the token contract. */
    name: string;
    /** EIP-712 domain `version` of the token contract. */
    version: string;
    decimals: number;
  };
  /** Where a transaction hash of this network can be looked at. */
  explorerTxBase: string;
};

export const X402_NETWORKS: readonly X402Network[] = [
  {
    id: "eip155:84532",
    chainId: 84532,
    label: "Base Sepolia",
    testnet: true,
    usdc: {
      address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      name: "USDC",
      version: "2",
      decimals: 6,
    },
    explorerTxBase: "https://sepolia.basescan.org/tx/",
  },
  {
    id: "eip155:8453",
    chainId: 8453,
    label: "Base",
    testnet: false,
    usdc: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      name: "USD Coin",
      version: "2",
      decimals: 6,
    },
    explorerTxBase: "https://basescan.org/tx/",
  },
];

export const X402_NETWORK_IDS = X402_NETWORKS.map((network) => network.id);

export const x402NetworkById = (id: unknown): X402Network | null =>
  X402_NETWORKS.find((network) => network.id === id) ?? null;

/**
 * Whether this deployment may take real USDC (t-2026-10-03-33). Ivan's word on
 * the task: real payments start once the intermediary company's wallet exists,
 * the test network until then. Read on every call, like
 * `cryptoPaymentsAvailable`, so a test can flip it around a request.
 */
export const X402_MAINNET_FLAG = "X402_MAINNET_AVAILABLE";

export const x402MainnetAvailable = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env[X402_MAINNET_FLAG] === "true";

/** The networks a shop may choose from on this instance right now. */
export const offeredX402Networks = (env: NodeJS.ProcessEnv = process.env): X402Network[] =>
  X402_NETWORKS.filter((network) => network.testnet || x402MainnetAvailable(env));

/** The explorer page of a transaction, or `null` for an unknown network or an empty hash. */
export const x402ExplorerUrl = (networkId: unknown, transaction: unknown): string | null => {
  const network = x402NetworkById(networkId);
  if (!network || typeof transaction !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(transaction)) {
    return null;
  }
  return `${network.explorerTxBase}${transaction}`;
};
