# t-2026-09-30-15 — дефекты моста тем: доказательства

Стенд: бэкенд :9613 на `upready_store_ex_13` (копия `upready_store_live_copy`), витрина :8613 через `next build && next start`, профиль `electronics`. Замер снят 30.09 ~08:35 WITA, после чего стенд погашен, а БД удалена. Все цвета взяты из computed-стилей Chromium, пиксели не использовались (`measure.mjs`). Переходы отключены до первого чтения.

| Приёмка | Доказательство |
|---|---|
| bridgeDark-строки `--contrast-fg-primary/-secondary/-border-base` возвращены в мост (не удалены), контраст в тёмном режиме ≥ 4.5:1 на каждом пресете | `specs/design-system/token-map.json` (3 строки `diverged`, есть `bridge` и `bridgeDark`); `themes-build-gate.log`: тёмный режим, fg-primary 9.98–10.81:1, fg-secondary 4.95–5.29:1 на 7 пресетах; на стенде те же числа, `measure.json` → `presets` |
| Цена и CTA героя на electronics берут `--primary` | `measure.json` → `pdp-light/dark.price` = `rgb(11,87,208)` / `rgb(77,157,255)` = `--primary`; `home-profile-*.heroCta.color` = `--primary` на плашке `--primary-foreground`; скриншоты `shots/pdp-electronics-*-1440.png`, `shots/home-profile-electronics-*-1440.png` |
| Подзаголовок full-bleed — `--contrast-fg-secondary` без `/80` | `measure.json` → `home-shop-*.subheadline`: `color(srgb 1 1 1 / 0.56)` (свет) и `--foreground` 56 % (тьма), класс `text-ui-contrast-fg-secondary`; скриншоты `shots/home-shop-electronics-*-1440.png` |
| Гейт themes:build: disabled-чернила ≥ 4.5:1 и фон disabled из muted для каждого пресета, включая womens-fashion; нарушение валит сборку | `themes-build-gate.log` (таблица «disabled pair»: 4.60–4.72:1, `--bg-disabled = --muted`, muted тише CTA); `themes-build-gate-negative.log`: 3 подстановки старых дефектов, каждая даёт exit 1 |

Повтор замера: поднять стенд, затем `PLAYWRIGHT_PATH=<node_modules/.pnpm/playwright@1.63.0/node_modules/playwright> BASE=http://olavka-com.localhost:8613 node docs/evidence/t-2026-09-30-15/measure.mjs`.
