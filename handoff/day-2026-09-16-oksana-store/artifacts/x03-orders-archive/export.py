#!/usr/bin/env python3
"""Выгрузка архива заказов/покупателей старого магазина (medusa_chrxn) в CSV.
Только чтение. Запуск: python3 export.py [--out DIR]"""
import json, subprocess, sys, os, decimal, re

PSQL = "/opt/homebrew/opt/postgresql@16/bin/psql"
DSN  = "postgres://ivanprotsko@localhost:5433/medusa_chrxn"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT  = HERE

def q(sql_file):
    sql = open(os.path.join(HERE, sql_file), encoding="utf-8").read()
    r = subprocess.run([PSQL, DSN, "-t", "-A", "-c", sql],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("psql failed on %s: %s" % (sql_file, r.stderr.strip()))
    out = r.stdout.strip()
    return json.loads(out) if out else []

def num(v):
    """Число -> строка с запятой как десятичным разделителем. None остаётся пустым."""
    if v is None:
        return ""
    d = decimal.Decimal(str(v)).normalize()
    s = format(d, "f")
    return s.replace(".", ",")

def text(v):
    """Номер/телефон как текст для Excel, чтобы не съело ведущий плюс или ноль."""
    return "" if v in (None, "") else '="%s"' % v

def cell(v):
    return "" if v is None else str(v)

EXCEL_TEXT = re.compile(r'^="[^";\r\n]*"$')

def field(v):
    """Excel-обёртка ="..." уходит в файл как есть — закавычив её, Excel показал бы
    служебные кавычки вместо номера. Остальное экранируется по RFC 4180."""
    s = "" if v is None else str(v)
    if EXCEL_TEXT.match(s):
        return s
    if any(ch in s for ch in ';"\r\n'):
        return '"' + s.replace('"', '""') + '"'
    return s

def write_csv(name, header, rows):
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        for row in [header] + rows:
            f.write(";".join(field(c) for c in row) + "\r\n")
    return path, len(rows)

orders = q("orders.sql")
items  = q("items.sql")
custs  = q("customers.sql")

o_rows = [[
    text(o["display_id"]), cell(o["created_at"]), cell(o["status"]),
    cell(o["payment_status"]), cell(o["fulfillment_status"]),
    cell(o["customer_name"]), cell(o["email"]), text(o["phone"]),
    cell(o["address"]), cell(o["shipping_method"]), cell(o["currency"]),
    num(o["subtotal"]), num(o["shipping"]), num(o["discount"]),
    num(o["total"]), num(o["paid"]), cell(o["items_qty"]), cell(o["items"]),
    cell(o["record_kind"]),
] for o in orders]

i_rows = [[
    text(i["display_id"]), cell(i["pos"]), text(i["sku"]), cell(i["title"]),
    cell(i["product_title"]), cell(i["variant_title"]), cell(i["quantity"]),
    num(i["unit_price"]), num(i["line_total"]), cell(i["currency"]),
] for i in items]

c_rows = [[
    cell(c["name"]), cell(c["email"]), text(c["phone"]), cell(c["has_account"]),
    cell(c["registered_at"]), cell(c["n_orders"]), cell(c["currencies"]),
    num(c["spent_rub"]), num(c["spent_usd"]), cell(c["first_order"]),
    cell(c["last_order"]), cell(c["last_address"]), cell(c["record_kind"]),
] for c in custs]

for name, header, rows in [
    ("orders.csv", ["Номер заказа","Дата (WITA)","Статус заказа","Статус оплаты",
        "Статус отгрузки","Покупатель","E-mail","Телефон","Адрес доставки",
        "Способ доставки","Валюта","Сумма товаров","Доставка","Скидка","Итого",
        "Оплачено","Позиций, шт","Состав заказа (SKU — товар × кол-во × цена)","Служебная запись"], o_rows),
    ("order-items.csv", ["Номер заказа","№ позиции","SKU","Наименование","Товар",
        "Вариант","Количество","Цена за единицу","Сумма позиции","Валюта"], i_rows),
    ("customers.csv", ["Покупатель","E-mail","Телефон","Есть личный кабинет",
        "Дата регистрации (WITA)","Заказов, шт","Валюты","Потрачено, RUB",
        "Потрачено, USD","Первый заказ","Последний заказ",
        "Последний адрес доставки","Служебная запись"], c_rows),
]:
    path, n = write_csv(name, header, rows)
    print("%s: %d строк данных" % (path, n))
