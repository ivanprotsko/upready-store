import { launch, shot, save, PANEL } from './lib.mjs'

const NAME = process.argv[2]
const TAG = process.argv[3]
const CATEGORY = 'Мёд'

const { browser, page, errors } = await launch()
const notes = []
const t0 = Date.now()

await page.goto(PANEL + '/products/create', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('input[name=title]', { timeout: 60000 })
await page.waitForTimeout(1200)

const D = page.locator('[role=dialog]').last()
await D.locator('input[name=title]').fill(NAME)
await page.waitForTimeout(800)

const handleShown = await D.locator('input[name=handle]').inputValue()
notes.push(`title=${NAME}`)
notes.push(`handleShownInForm=${handleShown}`)
await shot(page, `${TAG}-01-details`)

await D.locator('textarea[name=description]').fill('Приёмка f11-new-product-404. Временный товар, будет удалён.')
await D.locator('button:has-text("Продолжить")').click()
await page.waitForTimeout(3000)

await D.locator('input[name=categories]').click()
await page.waitForTimeout(1800)
await page.getByText(CATEGORY, { exact: true }).first().click()
await page.waitForTimeout(1000)
await page.keyboard.press('Escape')
await page.waitForTimeout(800)
await D.locator('button:has-text("Продолжить")').click()
await page.waitForTimeout(3500)

const rub = D.locator('input[name="variants.0.prices.rub"]')
notes.push('rubFieldCount=' + (await rub.count()))
if (await rub.count()) {
  await rub.first().fill('990')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
}
await shot(page, `${TAG}-02-variants`)

await D.locator('button:has-text("Опубликовать")').click()
await page.waitForTimeout(9000)
notes.push('afterPublishUrl=' + page.url())
notes.push('totalMs=' + (Date.now() - t0))
await shot(page, `${TAG}-03-published`)

const body = (await page.evaluate(() => document.body.innerText)).replace(/\n{2,}/g, '\n')
notes.push('BODY:\n' + body.slice(0, 600))
console.log(notes.join('\n'))
console.log('errors', JSON.stringify(errors.slice(0, 5)))
save(`02-create-${TAG}.json`, { name: NAME, handleShown, notes, errors, url: page.url() })
await browser.close()
