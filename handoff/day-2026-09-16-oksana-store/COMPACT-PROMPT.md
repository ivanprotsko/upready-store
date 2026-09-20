# Промпт для /compact (штабная сессия дня магазина Оксаны, 2026-09-15/16)

Сожми контекст, сохранив ТОЛЬКО это (всё остальное — на диске):

1. РОЛЬ И РЕЖИМ. Я — штабная сессия дня магазина Оксаны Черкашиной в главном чекауте
   /Users/ivanprotsko/upready/projects/upready-store (ветка dev, кода не пишу, только журналы
   handoff/ с BASE_COMMIT_OK=1 IVAN_OK=1). Иван спит, вопросов не задаю, работаю автономно до
   результата; «Разрешаю всё» (сообщение Ивана 2026-09-15 02:26 WITA). 16.09 — только этот магазин
   и upready-store, другие проекты не запускать.

2. ЧТО РАБОТАЕТ БЕЗ МЕНЯ. Диспетчер `handoff/day-2026-09-16-oksana-store/dispatcher.mjs`
   (тик 60 с) + сторож `run.sh` в cron `*/5` (перезапуск диспетчера/UI/Superset, caffeinate,
   сводка в Избранное Ивана раз в час через notify.py). Очередь 28 задач в tasks.json по PLAN.md
   (волны W0–W3), build-задачи = Superset workspace + агент, приёмка = claude -p → gh pr merge,
   деплои и QA = claude -p. Пульт: http://localhost:5390. Остановка: файл STOP (пауза) / DONE.

3. КАК Я ПРОСЫПАЮСЬ. В этой сессии стоит Monitor `sentinel.sh` (persistent): он присылает строку
   при новой задаче в needs-ivan/failed/blocked, файле logs/blocked-*.md, смерти диспетчера
   (тик старше 12 мин), лимите дольше 40 мин, DONE и пульс раз в 3 часа. Получив строку:
   прочитать REPORT.md («Требует внимания»), logs/blocked-<id>.md, лог приёмки
   (logs/accept-<id>-N.log) → решить по PLAN.md §6 → `node dispatcher.mjs cmd retry <id>`
   (или skip / mark-done), при мёртвом диспетчере `bash run.sh`, при лимите проверить
   авторизацию claude. Не переделывать работу воркеров руками — чинить очередь и промпты.

4. ГДЕ ИСТИНА НА ДИСКЕ. Resume-блок: /Users/ivanprotsko/upready/.ai/resume/upready-store/latest.md
   (2026-09-15-0325-7b183b97.md). Штаб: handoff/day-2026-09-16-oksana-store/{MISSION.md, PLAN.md,
   REPORT.md, tasks.json, state.json, logs/dispatcher.jsonl, research/*.md}. Память:
   ~/upready/memory/oksana-cherkashina-store-day-2026-09-16.md. Спека: ~/upready/specs/task-dispatcher/SPEC.md,
   механика ~/r/s8.md. Коммиты dev: a15bf51, bd4ced7, 0bb4987, fd033d5 (запушены).

5. ПРАВИЛА, КОТОРЫЕ ЛОМАЮТ ХОД, ЕСЛИ ЗАБЫТЬ. Каждый коммит с префиксом IVAN_OK=1 (плюс BASE_COMMIT_OK=1 на
   dev), запись файла и коммит разными вызовами; метки времени только через `$(date '+%Y-%m-%d %H:%M WITA')`;
   отправка наружу только Ивану самому (OUTREACH_OK=1); ничего не удалять из живой инфраструктуры
   (реестр protected-infra); гвард блокирует — повторить тот же вызов один раз с названным escape.

6. ЧТО ОТБРОСИТЬ. Тексты гвардов, выводы ps/curl, экраны терминалов, черновики движка, детали
   исследований (они в research/), промежуточные статусы задач (истина — state.json).
