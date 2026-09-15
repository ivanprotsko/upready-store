# Пилот реестра методов тестирования: три детектора на трёх настоящих багах 15.09

Идея Ивана: каждый найденный баг — повод завести МЕТОД, который находит весь класс таких багов в любом проекте; метод живёт в реестре, детекторы гоняются автоматически при планировании волн. Пилот делаем внутри этого репозитория в `tools/test-methods/` (позже вынесем в отдельный репозиторий).

## Три класса, на которых нужно доказать метод
1. **Нативная зависимость отсутствует в образе** — инцидент f17: образ mt-backend собрался без `sharp`, платформа отдавала 502 (см. `handoff/day-2026-09-16-oksana-store/prompts/f17*.md`, PR #44). Детектор: по `pnpm-lock.yaml`/`package.json` находит пакеты с нативной сборкой (`requiresBuild`, `optionalDependencies` с платформенными бинарями) и проверяет, что Dockerfile/сборка их не теряет (`--ignore-scripts`, отсутствие в `deploy`-манифесте, `optional` без fallback).
2. **Панель пишет поле, которое витрина не читает** — f16: панель сохраняла `metadata.image_url` категории, витрина нигде не показывала (PR #54). Детектор: статический — собирает ключи `metadata.*`, которые пишут формы `apps/tenant-panel`, и ключи, которые читает `apps/storefront`; ключи «пишется, но не читается» — красные.
3. **Приёмочная фикстура в компилируемом дереве** — f12/#50: `apps/backend/src/scripts/f12-seed-test-order.ts` уронил `medusa build` (artifacts/d04-deploy-mt-4/report.md, раздел 10). Детектор: файлы под `apps/*/src/**` с маркерами `fixture ONLY`/`seed-test`/`throwaway` или импортом тестовых helper'ов.

## Что сделать
- `tools/test-methods/registry.json`: записи `{id, bugClass, symptom, detector:{kind: static|build|runtime, cmd}, fixtures:{original:{sha, path}, variants:[…]}, scope:{languages, frameworks, paths}, placement: before-task|acceptance|after-deploy, evidence:{redOn, greenOn, falsePositives}}`.
- CLI `tools/test-methods/tm.mjs`: `list`, `match --symptom "<текст>"` (по ключевым словам класса), `run <id|all> [--base <sha>]`, вывод — таблица + JSON, ненулевой rc при красном.
- Для каждого класса: детектор красный на исходном баге (проверяй через `git show <sha>:<path>` во временный каталог, не через checkout рабочего дерева) и на 2–3 сгенерированных вариантах того же класса (`tools/test-methods/fixtures/<id>/variant-*`), зелёный на текущем `dev`. Зафиксируй в `evidence`.
- `tools/test-methods/README.md`: как добавить метод, как встроить в приёмку (`pnpm test:methods`), какие классы покрыты.

## Критерий готовности
`node tools/test-methods/tm.mjs run all` зелёный на ветке, три детектора с доказанным красным на исходных багах и вариантах, README, юнит-тесты CLI, PR.
