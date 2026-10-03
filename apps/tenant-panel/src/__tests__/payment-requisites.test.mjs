import { test } from "node:test"
import assert from "node:assert/strict"

import {
  initialsOf,
  isValidBankNumber,
  isValidCryptoAddress,
  maskAddress,
  maskBankNumber,
  moveItem,
} from "../lib/payment-requisites.ts"

/**
 * t-cherk-com-hotfix batch 6: the owner's requisites list. The rules mirror
 * the backend validator, by format only, so a stub with a broken checksum
 * stays savable.
 */

test("a bank number is a card, an account or an IBAN, nothing else", () => {
  assert.equal(isValidBankNumber("4400 4302 1234 5678"), true)
  assert.equal(isValidBankNumber("GE29NB0000000101904917"), true)
  assert.equal(isValidBankNumber("12"), false)
  assert.equal(isValidBankNumber("call me!"), false)
})

test("a crypto address must look like its network's own", () => {
  assert.equal(isValidCryptoAddress("TRC20", "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"), true)
  assert.equal(isValidCryptoAddress("ERC20", "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"), false)
  assert.equal(isValidCryptoAddress("ERC20", "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01"), true)
  assert.equal(isValidCryptoAddress("Bitcoin", "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01"), false)
})

test("the list row masks the number and the address", () => {
  assert.equal(maskBankNumber("4400 4302 1234 5678"), "•••• 5678")
  assert.equal(maskAddress("TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"), "TXYZop…AeBf")
  assert.equal(initialsOf("Bank of Georgia"), "BO")
})

test("moveItem moves one place and leaves the ends alone", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 1, -1), ["b", "a", "c"])
  assert.deepEqual(moveItem(["a", "b", "c"], 2, 1), ["a", "b", "c"])
})
