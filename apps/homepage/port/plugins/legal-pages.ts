/**
 * legal-pages.ts — вклеивает генератор правовых страниц в сборку и сообщает
 * приложению, состоялись ли эти страницы.
 *
 * Плагин делает две разные вещи в двух разных точках, и порядок тут
 * существенный.
 *
 * 1. `config` — ДО сборки бандла. Зовёт `build-legal.mjs --check` и по коду
 *    возврата объявляет константу `__LEGAL_PAGES_READY__`. Её читает подвал
 *    лендинга (`src/sections/shell/data.ts`): ссылки на /terms, /offer и
 *    /privacy попадают в разметку только тогда, когда страницы будут собраны.
 *    Так ссылка на 404 не может уехать в прод даже по недосмотру — не потому
 *    что кто-то помнит про неё, а потому что её физически нет в бандле.
 *
 * 2. `closeBundle` — ПОСЛЕ того, как `dist/` записан. Зовёт генератор в мягком
 *    режиме, и тот дописывает `dist/<slug>/index.html` рядом с лендингом.
 *
 * Почему плагин, а не строчка в `package.json`. Скрипт вида `"build": "vite
 * build && node scripts/build-legal.mjs"` обходится набором `npx vite build` —
 * той самой командой, которой лендинг собирают руками перед выкаткой. Плагин
 * висит на хуках сборки и срабатывает на любой её форме.
 *
 * Ненулевой код генератора означает не «нет реквизитов» (это разобрано внутри
 * него и даёт 0 с громким предупреждением), а поломку самого генератора —
 * такую сборку валить обязательно.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";

import type { Plugin } from "vite";

const GENERATOR = "scripts/build-legal.mjs";

function runGenerator(root: string, args: string[], quiet: boolean) {
  return spawnSync(process.execPath, [path.resolve(root, GENERATOR), ...args], {
    cwd: root,
    stdio: quiet ? ["ignore", "ignore", "ignore"] : "inherit",
  });
}

export function legalPagesPlugin(): Plugin {
  let root = process.cwd();
  let outDir = "dist";
  let isBuild = false;

  return {
    name: "upready:legal-pages",

    config(_userConfig, env) {
      // `config` зовётся раньше `configResolved`, root тут ещё не разрешён.
      const here = path.resolve(process.cwd());
      const ready = runGenerator(here, ["--check"], true).status === 0;

      if (env.command === "build") {
        process.stdout.write(
          ready
            ? "[legal-pages] реквизиты заполнены: ссылки на /terms, /offer, /privacy войдут в подвал\n"
            : "[legal-pages] реквизиты не заполнены: ссылок на правовые страницы в подвале не будет (подробности ниже, после сборки бандла)\n",
        );
      }

      return { define: { __LEGAL_PAGES_READY__: JSON.stringify(ready) } };
    },

    configResolved(resolved) {
      root = resolved.root;
      outDir = resolved.build.outDir;
      isBuild = resolved.command === "build";
    },

    closeBundle() {
      if (!isBuild) return; // в dev-режиме хук зовётся на остановке сервера

      const run = runGenerator(root, ["--out", path.resolve(root, outDir)], false);

      if (run.error) {
        throw new Error(`[legal-pages] генератор не запустился: ${run.error.message}`);
      }
      if (run.status !== 0) {
        throw new Error(
          `[legal-pages] генератор завершился с кодом ${run.status}. Это поломка самого генератора: ` +
            "нехватка реквизитов ему прощается и даёт код 0 с предупреждением выше.",
        );
      }
    },
  };
}
