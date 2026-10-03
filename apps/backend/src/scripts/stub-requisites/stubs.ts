import type { PaymentRequisite } from "../../api/tenants/payment-settings/manual/manual-payment";
import { cardFailingLuhn, evmAddressFailingChecksum, tronAddressFailingChecksum } from "./unpayable";

/** Every stub's id starts with this, so a rerun finds and replaces its own items and nothing else. */
export const STUB_ID_PREFIX = "stub-";

/**
 * Six banks and two wallets for the checkout to show before the owner enters
 * her own (Ivan 03.10: «сделай заглушки разных банков»). Holder «DEMO»; the
 * numbers fail Luhn and the addresses fail their checksums (`unpayable.ts`),
 * so nobody can pay to them.
 */
export const STUB_REQUISITES: PaymentRequisite[] = [
  { id: "stub-kaspi", kind: "bank", icon: "kaspi", bank: "Kaspi Bank", number: cardFailingLuhn("440043000000123"), holder: "DEMO" },
  { id: "stub-halyk", kind: "bank", icon: "halyk", bank: "Halyk Bank", number: cardFailingLuhn("440563000000456"), holder: "DEMO" },
  { id: "stub-freedom", kind: "bank", icon: "freedom", bank: "Freedom Bank", number: cardFailingLuhn("400303000000789"), holder: "DEMO" },
  { id: "stub-jusan", kind: "bank", icon: "jusan", bank: "Alatau City Bank (Jusan)", number: cardFailingLuhn("539545000000321"), holder: "DEMO" },
  { id: "stub-wise", kind: "bank", icon: "wise", bank: "Wise", number: cardFailingLuhn("535522000000654"), holder: "DEMO" },
  { id: "stub-tbc", kind: "bank", icon: "tbc", bank: "TBC Bank", number: cardFailingLuhn("418342000000987"), holder: "DEMO" },
  { id: "stub-usdt-trc20", kind: "crypto", currency: "USDT", network: "TRC20", address: tronAddressFailingChecksum("usdt-trc20") },
  { id: "stub-usdc-erc20", kind: "crypto", currency: "USDC", network: "ERC20", address: evmAddressFailingChecksum("usdc-erc20") },
];
