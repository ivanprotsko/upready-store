import { launch, shot, save, SHOP } from './lib.mjs'

const WANTED = [
  { title: 'Прополис', handle: 'propolis' },
  { title: 'Мазь-бальзам живичный', handle: 'maz-balzam-zhivichnyy' },
  { title: 'Настойка 50 мл', handle: 'nastoyka-50-ml' },
]
const CONTROL = { title: 'Свечи АСД с чесноком', handle: 'svechi-asd-s-chesnokom-10-sht-cherkashino' }

const { browser, page, errors } = await launch({ storage: false })
const rows = []

await page.goto(SHOP + '/ru/store', { waitUntil: 'load', timeout: 90000 })
await page.waitForTimeout(6000)
const catalog = await page.evaluate(() => document.body.innerText)
await shot(page, '03-catalog')

// Every card is read off the catalogue page BEFORE the first navigation away
// from it, or the lookups after the first one run on a product page and
// report «no card» for a card that is there (rule 20a: a zero is a
// measurement, and this one would have been a measurement of the wrong page).
const cards = {}
for (const item of [...WANTED, CONTROL]) {
  cards[item.handle] = await page.evaluate((title) => {
    const a = [...document.querySelectorAll('a')].find((x) => x.innerText.includes(title))
    return a ? { href: a.getAttribute('href'), text: a.innerText.replace(/\n+/g, ' | ') } : null
  }, item.title)
}

for (const item of [...WANTED, CONTROL]) {
  const card = cards[item.handle]
  const r = await page.goto(SHOP + '/ru/products/' + item.handle, { waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(3000)
  const text = await page.evaluate(() => document.body.innerText)
  rows.push({
    title: item.title,
    handle: item.handle,
    cardInCatalog: card,
    status: r ? r.status() : null,
    url: page.url(),
    showsTitle: text.includes(item.title),
    showsAddToCart: /В корзину/i.test(text),
    price: await page.locator('[data-testid="product-price"]').first().innerText().catch(() => null),
  })
  await shot(page, `03-page-${item.handle}`)
}

console.log('catalog has all three:', WANTED.every((w) => catalog.includes(w.title)))
for (const r of rows) {
  console.log(
    [r.title, r.handle, 'HTTP ' + r.status, 'название:' + r.showsTitle, 'корзина:' + r.showsAddToCart, 'цена:' + r.price, 'карточка:' + (r.cardInCatalog ? r.cardInCatalog.href : 'нет')].join(' | ')
  )
}
save('03-storefront.json', { rows, catalogHasAll: WANTED.every((w) => catalog.includes(w.title)), errors })
console.log('errors', JSON.stringify(errors.slice(0, 5)))
await browser.close()
