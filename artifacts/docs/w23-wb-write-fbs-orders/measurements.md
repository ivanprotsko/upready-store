# w23-wb-write-fbs-orders — замеры (сырьё для отчёта)

Стенд: Postgres `127.0.0.1:5433/upready_store_w23` (клон `upready_store_w20`), тенант `cherkashino`,
бэкенд `PORT=9423`. Живой хост не затронут. Записан 2026-09-16 07:13 WITA.

## 1. Имена полей FBS — измерены у живого кабинета, не взяты из документации

Портал `dev.wildberries.ru` рендерит примеры ответов СВЁРНУТЫМИ (`{"orders": [{}]}`), поэтому имён
полей заказа в сохранённых копиях нет вовсе. Мэппинг зеркала снят пробой
`apps/backend/scripts/fixtures/w23-probe-fbs.ts` (печатает только КЛЮЧИ и типы, не значения —
в сборочном задании лежит адрес покупателя). Прогон 2026-09-16 ~07:00 WITA:

```
marketplace.fbs.orders.new -> HTTP 200, 150 rows
  address:object article:string cargoType:number chrtId:number colorCode:string comment:string
  convertedCurrencyCode:number convertedFinalPrice:number convertedPrice:number createdAt:string
  crossBorderType:number currencyCode:number deliveryType:string finalPrice:number id:number
  isPickupPointShipmentAllowed:boolean isZeroOrder:boolean nmId:number officeId:number offices:array
  optionalMeta:array options:object orderUid:string price:number requiredMeta:array rid:string
  salePrice:number scanPrice:object skus:array userId:object warehouseId:number

marketplace.fbs.orders -> HTTP 200, 10 rows
  … то же, но БЕЗ salePrice/finalPrice/requiredMeta/optionalMeta/userId и С supplyId:string

marketplace.fbs.supplies -> HTTP 200, 10 rows
  cargoType:number closedAt:string createdAt:string crossBorderType:object destinationOfficeId:number
  done:boolean id:string isB2b:boolean isPickupPointShipmentAllowed:boolean name:string
  recommendedWhId:number rejectDt:object scanDt:string shippingDt:object shippingPointId:object
  shippingType:object spotAvailable:boolean waybillUuid:object

marketplace.fbs.orders.status -> HTTP 200, 10 rows
  id:number isCancellable:boolean isTransferable:boolean supplierStatus:string wbStatus:string
```

Отсюда два следствия, которых не было видно по документации:

1. **Ни один из двух методов списка заказов не возвращает `supplierStatus`.** Статус приходит
   только из `POST /api/v3/orders/status`, поэтому импорт `fbs_orders` делает второй запрос —
   зеркало без статусов было бы списком, по которому нельзя действовать.
2. **В сборочном задании лежат ПДн покупателя** (`address`, `comment`, `userId`). Они выброшены
   до записи строки (`stripOrderPii` в `src/modules/wb/sync.ts`); в `raw` их нет.

## 2. Единица цены — измерена, а не предположена

```
select order_id, article, price, converted_price, currency_code from wb_fbs_order …
5515416646 | Мумие банка | 81600 | 81600 | 643
```
Товар продаётся за 816 ₽ → `price` приходит в КОПЕЙКАХ. Для заказа в чужой валюте `price` —
минорные единицы валюты покупателя, а `convertedPrice` — то же в валюте продавца (643 = RUB):
`933` (BYN) даёт `price` 946 при `converted_price` 26434. Витрина показывает `converted_price/100`.

## 3. Живой импорт

```
WB_TENANT=cherkashino WB_KIND=supplies,fbs_orders npx medusa exec ./src/scripts/wb-sync.ts
wb:sync: supplies succeeded, 908 rows, 1 WB requests
wb:sync: fbs_orders succeeded, 16298 rows, 19 WB requests
```

Зеркало после прогона:

```
select count(*) orders, count(supplier_status) with_status from wb_fbs_order;  -- 8074 | 8074
select count(*) supplies, count(*) filter (where done) closed from wb_supply;  -- 908  | 880

supplier_status | wb_status          | count
complete        | sold               |  4324
complete        | sorted             |  1350
complete        | ready_for_pickup   |   961
complete        | canceled_by_client |   440
confirm         | waiting            |   419
cancel          | canceled           |   183
new             | declined_by_client |   173
new             | waiting            |   150
complete        | defect             |    32
complete        | waiting            |    23
new             | canceled_by_client |    13
confirm         | canceled_by_client |     6
```

`16298 rows` против 8074 строк — счётчик прогона считает ЗАПИСИ, а один заказ пишется дважды:
сперва телом (из `/orders/new` и `/orders`), потом статусом (из `/orders/status`). Это не дубли в
таблице: ключ `(tenant_id, order_id)` уникален, вторая запись — обновление.

## 4. Документация: только сохранённые копии

Приказ Ивана 2026-09-16 07:07 WITA: `dev.wildberries.ru` с этой машины не открывать (антибот
забанил публичный IP). Все цитаты в коде взяты из
`artifacts/docs/w10-marketplace-spec/docs/dev.wildberries.ru-en-orders-fbs.txt` (4284 строки) и
`artifacts/docs/w01-wb-readonly-client/docs/`. Ни одна страница портала в этой ветке не
запрашивалась. Вызовы шли только к `marketplace-api.wildberries.ru` — это Seller API, другой хост.
