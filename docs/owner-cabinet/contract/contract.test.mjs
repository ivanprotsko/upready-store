// t-2026-10-20-23: the examples match the contract, the contract refuses any field it does not
// name, and no property anywhere in it is a buyer's personal data.
//
//   node --test docs/owner-cabinet/contract/contract.test.mjs
//
// The repository has no JSON Schema library at its root, so this walks the subset of draft
// 2020-12 the two schema files use: type, const, enum, properties, required,
// additionalProperties: false, items, minItems, maxItems, minLength, maxLength, minimum,
// maximum, pattern, oneOf and $ref (local `#/$defs/…` or the sibling file).
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const read = (name) => JSON.parse(readFileSync(join(here, name), "utf8"))

const files = {
  "shop-summary.v1.schema.json": read("shop-summary.v1.schema.json"),
  "owner-summary.v1.schema.json": read("owner-summary.v1.schema.json"),
}

const resolve = (ref, root) => {
  const [file, pointer = ""] = ref.split("#")
  const doc = file ? files[file] : root
  assert.ok(doc, `unknown $ref file ${file}`)
  const node = pointer
    .split("/")
    .filter(Boolean)
    .reduce((at, part) => at[part], doc)
  return { node, root: doc }
}

const typeOf = (value) =>
  value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value

const validate = (schema, value, root, path = "$") => {
  const errors = []
  if (schema.$ref) {
    const { node, root: next } = resolve(schema.$ref, root)
    errors.push(...validate(node, value, next, path))
  }
  if (schema.oneOf) {
    const passing = schema.oneOf.filter((one) => validate(one, value, root, path).length === 0)
    if (passing.length !== 1) errors.push(`${path}: matches ${passing.length} of oneOf`)
  }
  if (schema.const !== undefined && value !== schema.const) errors.push(`${path}: not ${schema.const}`)
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${value} not in enum`)
  if (schema.type) {
    const types = [].concat(schema.type)
    const actual = typeOf(value)
    if (!types.includes(actual) && !(actual === "integer" && types.includes("number"))) {
      errors.push(`${path}: ${actual} is not ${types.join("|")}`)
      return errors
    }
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: too short`)
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: too long`)
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) errors.push(`${path}: «${value}» fails pattern`)
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum`)
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above maximum`)
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: too few items`)
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: too many items`)
    if (schema.items) value.forEach((item, i) => errors.push(...validate(schema.items, item, root, `${path}[${i}]`)))
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${path}: missing ${key}`)
    }
    for (const [key, item] of Object.entries(value)) {
      const sub = schema.properties?.[key]
      if (sub) errors.push(...validate(sub, item, root, `${path}.${key}`))
      else if (schema.additionalProperties === false) errors.push(`${path}: field «${key}» is not in the contract`)
    }
  }
  return errors
}

const shopSchema = files["shop-summary.v1.schema.json"]
const ownerSchema = files["owner-summary.v1.schema.json"]

test("the shop examples match shop-summary/v1", () => {
  for (const name of ["example.shop-summary.ru.json", "example.shop-summary.intl.json"]) {
    assert.deepEqual(validate(shopSchema, read(name), shopSchema), [], name)
  }
})

test("the panel examples match owner-summary/v1", () => {
  for (const name of ["example.owner-summary.ru.json", "example.owner-summary.intl-late.json", "example.owner-summary.ru-missing.json"]) {
    assert.deepEqual(validate(ownerSchema, read(name), ownerSchema), [], name)
  }
})

test("a buyer's field anywhere in a payload is refused", () => {
  const cases = [
    (p) => (p.orders.last_customer_email = "buyer@example.com"),
    (p) => (p.periods["7d"].top_products[0].buyer = "Анна"),
    (p) => (p.reviews.latest = [{ author_name: "Анна", body: "…" }]),
    (p) => (p.daily[0].city = "Казань"),
    (p) => (p.shop.owner_phone = "+79990000000"),
  ]
  for (const mutate of cases) {
    const payload = read("example.shop-summary.ru.json")
    mutate(payload)
    assert.ok(validate(shopSchema, payload, shopSchema).some((e) => e.includes("is not in the contract")))
  }
})

test("every object of the contract is closed", () => {
  const walk = (node, path) => {
    if (!node || typeof node !== "object") return
    if (node.properties) assert.equal(node.additionalProperties, false, `${path} is open`)
    for (const [key, child] of Object.entries(node)) walk(child, `${path}/${key}`)
  }
  walk(shopSchema, "shop-summary")
  walk(ownerSchema, "owner-summary")
})

test("no property of the contract names a person's data", () => {
  const forbidden = /(e-?mail|phone|address|first_?name|last_?name|full_?name|author|customer|buyer|passport|birth|city|street|zip|postal|ip|comment|note|body|text)/i
  const names = []
  const walk = (node) => {
    if (!node || typeof node !== "object") return
    if (node.properties) names.push(...Object.keys(node.properties))
    for (const child of Object.values(node)) walk(child)
  }
  walk(shopSchema)
  walk(ownerSchema)
  assert.deepEqual(names.filter((name) => forbidden.test(name)), [])
})

test("one payload stays small: under 32 KB as JSON", () => {
  for (const name of ["example.shop-summary.ru.json", "example.shop-summary.intl.json"]) {
    assert.ok(readFileSync(join(here, name)).length < 32 * 1024, name)
  }
})
