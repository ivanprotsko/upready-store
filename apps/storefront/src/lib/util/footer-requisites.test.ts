import { describe, expect, it } from "vitest"

import {
  FOOTER_REQUISITES_ENV,
  footerRequisitesEnabled,
  footerRequisitesLine,
  footerRequisitesParts,
  isSoleTraderRegNumber,
  sellerNameWithForm,
} from "./footer-requisites"

/**
 * t-2026-10-08-13. Robokassa moderates a shop only when the seller's requisites stand in
 * the footer, and Ivan's order of 03.10 («никаких ссылок на ИП Черкашина и т.д. Быть не
 * должно») holds wherever the switch is off. Every name and number here is made up.
 */

const labels = {
  taxId: (value: string) => `ИНН ${value}`,
  regNumber: (value: string) => `ОГРН ${value}`,
  regNumberSoleTrader: (value: string) => `ОГРНИП ${value}`,
}

const SOLE_TRADER_NUMBER = "300000000000001"
const COMPANY_NUMBER = "1000000000001"

const soleTrader = {
  legal_name: "Иванова Мария Петровна",
  inn: "000000000001",
  ogrn: SOLE_TRADER_NUMBER,
  legal_address: null,
}

describe("the switch STOREFRONT_FOOTER_REQUISITES", () => {
  it("is off when the variable is absent or empty", () => {
    expect(footerRequisitesEnabled({})).toBe(false)
    expect(footerRequisitesEnabled({ [FOOTER_REQUISITES_ENV]: "" })).toBe(false)
  })

  it("is on for 1 and for true, whatever the case and the spaces around", () => {
    expect(footerRequisitesEnabled({ [FOOTER_REQUISITES_ENV]: "1" })).toBe(true)
    expect(footerRequisitesEnabled({ [FOOTER_REQUISITES_ENV]: "true" })).toBe(true)
    expect(footerRequisitesEnabled({ [FOOTER_REQUISITES_ENV]: " TRUE " })).toBe(true)
  })

  it("is off for every other value", () => {
    for (const value of ["0", "false", "no", "off", "yes", "2"]) {
      expect(footerRequisitesEnabled({ [FOOTER_REQUISITES_ENV]: value })).toBe(false)
    }
  })

  it("prints nothing while it is off, with every field filled in", () => {
    const seller = { ...soleTrader, legal_address: "170000, г. Тверь, ул. Примерная, д. 1" }

    expect(footerRequisitesLine(seller, labels, {})).toEqual([])
    expect(footerRequisitesLine(seller, labels, { [FOOTER_REQUISITES_ENV]: "0" })).toEqual([])
  })

  it("prints the name with «ИП», the ОГРНИП and the ИНН once it is on", () => {
    expect(footerRequisitesLine(soleTrader, labels, { [FOOTER_REQUISITES_ENV]: "1" })).toEqual([
      "ИП Иванова Мария Петровна",
      `ОГРНИП ${SOLE_TRADER_NUMBER}`,
      "ИНН 000000000001",
    ])
  })
})

describe("«ИП» in front of the seller's name", () => {
  it("goes in front of a name with no form of its own and a number of 15 digits", () => {
    expect(sellerNameWithForm("Иванова Мария Петровна", SOLE_TRADER_NUMBER)).toBe(
      "ИП Иванова Мария Петровна"
    )
  })

  it("leaves a name that carries its own form as the owner typed it", () => {
    for (const name of [
      "ИП Иванова Мария Петровна",
      "Индивидуальный предприниматель Иванова Мария Петровна",
      "индивидуальный предприниматель Иванова М. П.",
      "ООО «Ромашка»",
      "АО «Ромашка»",
    ]) {
      expect(sellerNameWithForm(name, SOLE_TRADER_NUMBER)).toBe(name)
    }
  })

  it("leaves a name next to a number of 13 digits as the owner typed it", () => {
    expect(sellerNameWithForm("Ромашка", COMPANY_NUMBER)).toBe("Ромашка")
  })

  it("does not take letters inside a word for a form", () => {
    // «ИП» inside «Ипатова» and «АО» inside «Аокина» are parts of a surname.
    expect(sellerNameWithForm("Ипатова Анна Олеговна", SOLE_TRADER_NUMBER)).toBe(
      "ИП Ипатова Анна Олеговна"
    )
    expect(sellerNameWithForm("АОКИНА Анна", SOLE_TRADER_NUMBER)).toBe("ИП АОКИНА Анна")
  })

  it("adds nothing without a number, and gives null without a name", () => {
    expect(sellerNameWithForm("Иванова Мария Петровна", null)).toBe("Иванова Мария Петровна")
    expect(sellerNameWithForm("  ", SOLE_TRADER_NUMBER)).toBeNull()
    expect(sellerNameWithForm(null, SOLE_TRADER_NUMBER)).toBeNull()
  })
})

describe("the pieces of the requisites line", () => {
  it("counts 15 digits as an ОГРНИП, spaces aside, and nothing else", () => {
    expect(isSoleTraderRegNumber(SOLE_TRADER_NUMBER)).toBe(true)
    expect(isSoleTraderRegNumber("300 000 000 000 001")).toBe(true)
    expect(isSoleTraderRegNumber(COMPANY_NUMBER)).toBe(false)
    expect(isSoleTraderRegNumber("30000000000000A")).toBe(false)
    expect(isSoleTraderRegNumber(null)).toBe(false)
  })

  it("labels a number of 13 digits as an ОГРН", () => {
    expect(
      footerRequisitesParts(
        { legal_name: "ООО «Ромашка»", inn: "0000000001", ogrn: COMPANY_NUMBER, legal_address: null },
        labels
      )
    ).toEqual(["ООО «Ромашка»", `ОГРН ${COMPANY_NUMBER}`, "ИНН 0000000001"])
  })

  it("puts the legal address last when the owner filled it", () => {
    expect(
      footerRequisitesParts(
        { ...soleTrader, legal_address: " 170000, г. Тверь, ул. Примерная, д. 1 " },
        labels
      ).at(-1)
    ).toBe("170000, г. Тверь, ул. Примерная, д. 1")
  })

  it("skips a field the owner left empty, and gives nothing for no seller", () => {
    expect(
      footerRequisitesParts({ legal_name: "Иванова Мария Петровна", inn: " ", ogrn: null, legal_address: "" }, labels)
    ).toEqual(["Иванова Мария Петровна"])
    expect(footerRequisitesParts(null, labels)).toEqual([])
  })
})
