#!/bin/sh
# Воспроизводит замеры отчёта 2026-09-14-market-intelligence.
# Каждый замер печатает URL, HTTP-код, размер HTML, размер видимого текста
# и число уникальных ценовых токенов в СТАТИЧЕСКОМ HTML (без JS).
# Запуск: sh measure.sh <каталог-вывода>
set -e
OUT="${1:-./out}"; mkdir -p "$OUT/robots" "$OUT/pages"
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'

echo "== robots.txt =="
for h in tilda.cc www.shopify.com www.insales.ru www.wix.com; do
  code=$(curl -sS -A "$UA" -m 25 -o "$OUT/robots/$h.txt" -w '%{http_code}' "https://$h/robots.txt")
  echo "$h http=$code bytes=$(wc -c < "$OUT/robots/$h.txt")"
done

echo "== страницы тарифов =="
for u in https://www.shopify.com/pricing https://www.wix.com/plans https://tilda.cc/pricing/ \
         https://www.insales.ru/page/newplans https://www.insales.ru/page/obnovlenie-tarifov-insales-v-2026; do
  n=$(echo "$u" | sed 's|https://||; s|/|_|g')
  curl -sS -A "$UA" -m 40 -L "$u" -o "$OUT/pages/$n.html" -w "$n http=%{http_code} bytes=%{size_download}\n"
done

echo "== HTML -> видимый текст -> ценовые токены =="
python3 - "$OUT/pages" <<'PY'
import re, html, sys, os, glob
def plain(s):
    s = re.sub(r'(?is)<(script|style|noscript|svg).*?</\1>', ' ', s)
    s = re.sub(r'(?s)<[^>]+>', ' ', s)
    s = html.unescape(s)
    s = re.sub(r'[ \t\xa0]+', ' ', s)
    return re.sub(r'\n\s*\n+', '\n', s).strip()
for f in sorted(glob.glob(os.path.join(sys.argv[1], '*.html'))):
    raw = open(f, encoding='utf-8', errors='replace').read()
    t = plain(raw)
    usd = set(re.findall(r'\$\s?\d[\d.,]*', t))
    rub = set(re.findall(r'\d[\d  ]{2,9}\s?(?:₽|руб)', t))
    print(f"{os.path.basename(f):40s} html={len(raw):>9} text={len(t):>7} usd={len(usd):>3} rub={len(rub):>3}")
PY
