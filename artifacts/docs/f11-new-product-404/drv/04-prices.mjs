import { launch, save, SHOP } from './lib.mjs'

const ITEMS = [
  { title: 'Прополис', handle: 'propolis' },
  { title: 'Мазь-бальзам живичный', handle: 'maz-balzam-zhivichnyy' },
  { title: 'Настойка 50 мл', handle: 'nastoyka-50-ml' },
  { title: 'Свечи АСД с чесноком', handle: 'svechi-asd-s-chesnokom-10-sht-cherkashino' },
]

const { browser, page, errors } = await launch({ storage: false })
const rows = []
for (const item of ITEMS) {
  const r = await page.goto(SHOP + '/ru/products/' + item.handle, { waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(3500)
  const price = await page
    .locator('[data-testid="product-price"]')
    .first()
    .innerText()
    .catch(() => null)
  rows.push({ handle: item.handle, status: r.status(), price })
  console.log([item.handle, 'HTTP ' + r.status(), 'цена=' + JSON.stringify(price)].join(' | '))
}
save('04-prices.json', { rows, errors })
await browser.close()
