# Деплой @upreadystore_bot

Бот — длинный опрос (`getUpdates`), а не webhook: ему НЕ нужен входящий порт,
метка traefik, DNS-запись или сертификат. Всё, что нужно, — процесс с токеном,
который переживает перезагрузку.

**Где живёт:** always-on хост Coolify `root@84.46.251.149` (ключ
`~/.ssh/id_ed25519_contabo`), каталог `/opt/upready-store-bot`, отдельный
compose-проект `upready-store-bot`, контейнер `upreadystore-bot`.

> На хосте рядом стоят ЧУЖИЕ стеки (agent-creatr `agentcreatr-bridge`,
> `coolify-proxy`, MT-стенды). Все команды ниже указывают `-f` на СВОЙ файл и
> не трогают ничего вокруг. Голый `docker compose up` из общего каталога,
> `docker system prune`, `docker volume rm` — запрещены.

## Единственное правило, которое ломает бота

Telegram отдаёт `getUpdates` ОДНОМУ потребителю на токен. Второй получает
`409 Conflict: terminated by other getUpdates request`, и сообщения начинают
теряться у обоих. Поэтому перед стартом контейнера локальный процесс на
ноутбуке должен быть убит:

```sh
ps -ax -o pid,command | grep -E "bot/src/index.ts" | grep -v grep   # найти
kill <pid>
ps -p <pid> -o pid,command                                          # rc=1 = его нет
```

## Первый деплой

```sh
# 1. код и упаковка на хост (rsync с ЯВНЫМ каталогом-приёмником, .env не едет)
ssh -i ~/.ssh/id_ed25519_contabo root@84.46.251.149 'mkdir -p /opt/upready-store-bot && chmod 750 /opt/upready-store-bot'
rsync -av --delete --exclude='.env' --exclude='node_modules' --exclude='*.log' \
  -e "ssh -i $HOME/.ssh/id_ed25519_contabo" \
  apps/bot/ root@84.46.251.149:/opt/upready-store-bot/

# 2. приёмка переноса — md5 по ЦЕЛЕВОМУ пути, а не по факту передачи (правило 42c)
md5 -q Dockerfile docker-compose.yml package.json src/index.ts
ssh -i ~/.ssh/id_ed25519_contabo root@84.46.251.149 \
  'cd /opt/upready-store-bot && md5sum Dockerfile docker-compose.yml package.json src/index.ts'

# 3. секреты: .env кладётся отдельно, значение НИКОГДА не печатается
scp -q -i ~/.ssh/id_ed25519_contabo apps/bot/.env root@84.46.251.149:/opt/upready-store-bot/.env
ssh -i ~/.ssh/id_ed25519_contabo root@84.46.251.149 'chmod 600 /opt/upready-store-bot/.env'

# 4. старт
ssh -i ~/.ssh/id_ed25519_contabo root@84.46.251.149 \
  'docker compose -f /opt/upready-store-bot/docker-compose.yml up -d --build'
```

## Обновление кода

```sh
rsync -av --delete --exclude='.env' --exclude='node_modules' --exclude='*.log' \
  -e "ssh -i $HOME/.ssh/id_ed25519_contabo" \
  apps/bot/ root@84.46.251.149:/opt/upready-store-bot/
ssh -i ~/.ssh/id_ed25519_contabo root@84.46.251.149 \
  'docker compose -f /opt/upready-store-bot/docker-compose.yml up -d --build'
```

## Откат

```sh
# А. откатить КОД: вернуть рабочее дерево на нужный коммит и повторить обновление
git checkout <good-sha> -- apps/bot && <rsync + up -d --build выше>

# Б. погасить только СВОЙ стек (чужие контейнеры не трогает)
ssh -i ~/.ssh/id_ed25519_contabo root@84.46.251.149 \
  'docker compose -f /opt/upready-store-bot/docker-compose.yml down'

# В. аварийный запасной аэродром — бот на ноутбуке, пока хост недоступен.
#    ТОЛЬКО после того, как контейнер погашен (один потребитель на токен!)
cd apps/bot && node src/index.ts > /tmp/upreadystore-bot.log 2>&1 &
```

## Приёмка (что именно измерять)

```sh
# 1. контейнер жив
ssh -i ~/.ssh/id_ed25519_contabo root@84.46.251.149 \
  'docker ps --filter name=upreadystore-bot --format "{{.Names}} | {{.Status}}"'

# 2. в логе есть bot.start с настоящим username и НЕТ getUpdates.failed
ssh -i ~/.ssh/id_ed25519_contabo root@84.46.251.149 'docker logs --tail 50 upreadystore-bot'

# 3. Telegram согласен, что бот живой (читающий вызов, никому ничего не шлёт)
curl -s "https://api.telegram.org/bot$TOKEN/getMe"

# 4. КОНТЕЙНЕР ДЕЙСТВИТЕЛЬНО ОПРАШИВАЕТ. Свой конкурирующий getUpdates обязан
#    получить 409, и в логе контейнера обязан появиться зеркальный 409.
#    Ровно это отличает «процесс запущен» от «бот отвечает».
curl -s --max-time 20 "https://api.telegram.org/bot$TOKEN/getUpdates?timeout=12&limit=1&offset=-1"
ssh -i ~/.ssh/id_ed25519_contabo root@84.46.251.149 \
  'docker logs --since 2m upreadystore-bot | grep getUpdates.failed'

# 5. сквозная проверка диплинка живым клиентом Telegram (macOS):
open "tg://resolve?domain=upreadystore_bot&start=plan_2"
ssh -i ~/.ssh/id_ed25519_contabo root@84.46.251.149 \
  'docker logs --since 3m upreadystore-bot | grep -E "sendMessage.request|sendMessage.ok"'
# В логе должны стоять payload "plan_2", source "command" и sendMessage.ok с message_id.
```

## Проверка, что соседи целы (обязательна после КАЖДОЙ операции на хосте)

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://hooks.svgnoon.upready.dev/health   # 200
ssh -i ~/.ssh/id_ed25519_contabo root@84.46.251.149 \
  'docker ps --format "{{.Names}} {{.Status}}" | grep -E "agentcreatr-bridge|coolify-proxy"'
```

## Переменные окружения

Полный список и смысл каждой — в `.env.example` рядом. Коротко:

| Переменная | Сегодня | Что будет, если не задать |
|---|---|---|
| `TELEGRAM_UPREADY_STORE_BOT` | ЗАДАНА (боевой токен) | процесс пишет `token.missing` и выходит с кодом 1 |
| `TRIBUTE_URL_PLAN_{1,2,3}_{RU_MIR,VISA_MC}` | НЕ ЗАДАНЫ намеренно — Tribute ещё не подключён | кнопка оплаты НЕ рисуется вовсе; сообщение честно говорит «оплату сейчас подключаем». Мёртвых кнопок не бывает по замыслу (правило 20a) |
| `TELEGRAM_API_BASE` | не задана | боевой `https://api.telegram.org`; переопределяется только для локального снятия исходящих |
| `UPREADY_BACKEND_URL` | НЕ ЗАДАНА (t08 только въехал) | владелец магазина, нажавший «Подключить Telegram», получает от бота «привязка пока не настроена», в логе — `link.unconfigured` |
| `TELEGRAM_LINK_SECRET` | НЕ ЗАДАНА | то же самое; значение обязано СОВПАДАТЬ с `TELEGRAM_LINK_SECRET` у `mt-backend` в `/opt/upready-store/mt/deploy/mt/shipshift.env` |

Когда Tribute отдаст адреса — дописать их в `/opt/upready-store-bot/.env` и
выполнить `docker compose -f /opt/upready-store-bot/docker-compose.yml up -d`;
в логе после старта вместо `payment.link.missing` встанет `payment.link.ready`.

## Привязка магазина к чату (t08-order-notifications)

Владелец магазина открывает в панели «Уведомления», жмёт «Подключить Telegram»
и получает ссылку `https://t.me/upreadystore_bot?start=lk_<код>`. Telegram
отдаёт код боту как payload `/start`; бот сам не знает, чей это магазин, и
пересылает пару «код + chat_id» на `POST <UPREADY_BACKEND_URL>/telegram/link`
с заголовком `x-telegram-link-secret`. Бэкенд запоминает чат за магазином и
возвращает готовый текст ответа — формулировка живёт на бэкенде, бот её только
печатает.

Что важно помнить про этот путь:

- Сообщения о заказах шлёт БЭКЕНД, а не этот процесс: `sendMessage` можно звать
  из скольких угодно мест, а `getUpdates` Telegram отдаёт ровно одному
  потребителю на токен. Поэтому у `mt-backend` стоит ТОТ ЖЕ токен в
  `TELEGRAM_BOT_TOKEN`, и это не второй опрос, а только отправка.
- Код одноразовый и живёт 15 минут. Просроченный или чужой код — это ответ
  владельцу («получите новый в панели»), а не молчание.
- Бот и MT-стек стоят в разных compose-проектах, общей сети у них нет, поэтому
  `UPREADY_BACKEND_URL` — публичный адрес движка (`https://shipshift.dev`),
  а не имя контейнера.

## Почему в образе нет шага сборки

У приложения ноль runtime-зависимостей, а Node 22.18+ исполняет TypeScript
напрямую. Проверено не рассуждением, а прогоном в ТОМ ЖЕ образе:

```
docker run --rm --entrypoint node upreadystore-bot:local --version
  v22.23.2
docker run --rm --entrypoint node upreadystore-bot:local --test src/message.test.ts src/route.test.ts
  # tests 15
  # pass 15
  # fail 0
```
