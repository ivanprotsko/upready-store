#!/usr/bin/env python3
"""Сверка готовых CSV с базой. Читает файлы с диска, а не то, что было в памяти генератора."""
import csv, json, subprocess, sys, os, decimal

PSQL = "/opt/homebrew/opt/postgresql@16/bin/psql"
DSN  = "postgres://ivanprotsko@localhost:5433/medusa_chrxn"
HERE = os.path.dirname(os.path.abspath(__file__))

def db(sql):
    r = subprocess.run([PSQL, DSN, "-t", "-A", "-F", "\x1f", "-c", sql],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("psql failed: " + r.stderr.strip())
    return [l.split("\x1f") for l in r.stdout.strip().splitlines() if l]

def load(name):
    with open(os.path.join(HERE, name), encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))

def D(s):
    s = (s or "").strip().replace(",", ".")
    return decimal.Decimal(s) if s else decimal.Decimal(0)

fails = []
def check(label, got, want):
    ok = str(got) == str(want)
    print("%-4s %s: csv=%s db=%s" % ("OK" if ok else "FAIL", label, got, want))
    if not ok:
        fails.append(label)

orders = load("orders.csv"); items = load("order-items.csv"); custs = load("customers.csv")

check("строк orders.csv", len(orders), db("select count(*) from \"order\" where deleted_at is null")[0][0])
check("строк order-items.csv", len(items), db("select count(*) from order_item oi join \"order\" o on o.id=oi.order_id and o.deleted_at is null where oi.deleted_at is null")[0][0])
check("строк customers.csv", len(custs), db("select count(*) from customer where deleted_at is null")[0][0])

agg = {r[0]: r for r in db("""
select upper(o.currency_code), count(*),
       sum((s.totals->>'accounting_total')::numeric),
       sum((s.totals->>'paid_total')::numeric)
from "order" o join order_summary s on s.order_id=o.id and s.version=o.version and s.deleted_at is null
where o.deleted_at is null group by 1""")}
for cur in sorted(agg):
    rows = [r for r in orders if r["Валюта"] == cur]
    check("заказов %s" % cur, len(rows), agg[cur][1])
    check("сумма «Итого» %s" % cur, D(str(sum(D(r["Итого"]) for r in rows))).normalize(), decimal.Decimal(agg[cur][2]).normalize())
    check("сумма «Оплачено» %s" % cur, D(str(sum(D(r["Оплачено"]) for r in rows))).normalize(), decimal.Decimal(agg[cur][3]).normalize())

check("единиц товара всего", sum(int(D(r["Количество"])) for r in items),
      db("select sum(oi.quantity) from order_item oi join \"order\" o on o.id=oi.order_id and o.deleted_at is null where oi.deleted_at is null")[0][0])
check("сумма «Заказов, шт» в customers.csv", sum(int(D(r["Заказов, шт"])) for r in custs),
      db("select count(*) from \"order\" where deleted_at is null and customer_id is not null")[0][0])

bad = [r["Номер заказа"] for r in orders
       if D(r["Сумма товаров"]) + D(r["Доставка"]) - D(r["Скидка"]) != D(r["Итого"])]
check("строк, где Итого ≠ Товары+Доставка−Скидка", len(bad), 0)

# NULL остаётся пустым, а не превращается в ноль или прочерк
check("пустых «Телефон» в orders.csv", sum(1 for r in orders if not r["Телефон"].strip()),
      db("select count(*) from \"order\" o left join order_address a on a.id=o.shipping_address_id where o.deleted_at is null and coalesce(a.phone,'')=''")[0][0])
check("пустых «Адрес доставки»", sum(1 for r in orders if not r["Адрес доставки"].strip()),
      db("select count(*) from \"order\" where deleted_at is null and shipping_address_id is null")[0][0])

check("служебных заказов", sum(1 for r in orders if r["Служебная запись"].strip()),
      db("""select count(*) from "order" where deleted_at is null and (
            split_part(email,'@',2) ~* '(\\.local$|\\.test$|^test\\.|\\.invalid$|^example\\.|^upready\\.dev$|^ivanprotsko\\.com$|^smoke\\.)'
            or email ~* '^(test|demo|selfheal|p[0-9]+-)')""")[0][0])
check("служебных покупателей", sum(1 for r in custs if r["Служебная запись"].strip()),
      db("""select count(*) from customer where deleted_at is null and (
            split_part(email,'@',2) ~* '(\\.local$|\\.test$|^test\\.|\\.invalid$|^example\\.|^upready\\.dev$|^ivanprotsko\\.com$|^smoke\\.)'
            or email ~* '^(test|demo|selfheal|p[0-9]+-)')""")[0][0])

for name in ("orders.csv", "customers.csv", "order-items.csv"):
    with open(os.path.join(HERE, name), "rb") as f:
        check("%s: UTF-8 BOM" % name, f.read(3) == b"\xef\xbb\xbf", True)

# Поштучная сверка трёх заказов: поле за полем
SPOT = ["1", "69", "117"]
for did in SPOT:
    row = next((r for r in orders if r["Номер заказа"] == '="%s"' % did), None)
    if row is None:
        fails.append("spot %s: строки нет" % did); print("FAIL spot %s: строки нет" % did); continue
    d = db("""select to_char(o.created_at at time zone 'Asia/Makassar','YYYY-MM-DD HH24:MI'),
                     upper(o.currency_code), (s.totals->>'accounting_total')::numeric,
                     (s.totals->>'paid_total')::numeric,
                     coalesce((select sum(oi.quantity) from order_item oi where oi.order_id=o.id and oi.deleted_at is null),0),
                     coalesce((select count(*) from order_item oi where oi.order_id=o.id and oi.deleted_at is null),0)
              from "order" o join order_summary s on s.order_id=o.id and s.version=o.version and s.deleted_at is null
              where o.display_id=%s""" % did)[0]
    n_items = sum(1 for i in items if i["Номер заказа"] == '="%s"' % did)
    pairs = [("дата", row["Дата (WITA)"], d[0]), ("валюта", row["Валюта"], d[1]),
             ("итого", D(row["Итого"]).normalize(), decimal.Decimal(d[2]).normalize()),
             ("оплачено", D(row["Оплачено"]).normalize(), decimal.Decimal(d[3]).normalize()),
             ("единиц товара", int(D(row["Позиций, шт"])), int(d[4])),
             ("строк позиций", n_items, int(d[5]))]
    diff = [p[0] for p in pairs if str(p[1]) != str(p[2])]
    print("%-4s заказ %s: итого %s %s, единиц %s, строк позиций %s — сверено полей %d, расхождений %d"
          % ("OK" if not diff else "FAIL", did, row["Итого"], row["Валюта"],
             row["Позиций, шт"], n_items, len(pairs), len(diff)))
    if diff:
        fails.append("spot %s: %s" % (did, ",".join(diff)))

print("VERIFY-ALL: " + ("OK" if not fails else "FAIL " + "; ".join(fails)))
sys.exit(1 if fails else 0)
