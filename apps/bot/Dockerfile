# Образ бота @upreadystore_bot.
#
# Сборки нет и быть не должно: у приложения НОЛЬ runtime-зависимостей, а Node
# 22.18+ исполняет TypeScript напрямую (type stripping включён по умолчанию).
# Замер на хосте 84.46.251.149: `docker run --rm node:22-alpine node --version`
# → v22.23.2, что удовлетворяет engines ">=22.18.0" из package.json.
# Проверка того, что образ ДЕЙСТВИТЕЛЬНО исполняет .ts, а не «должен бы» —
# шаг `node --test` в DEPLOY.md, он гоняется в этом же образе.
FROM node:22-alpine

WORKDIR /app

# devDependencies (typescript, @types/node) нужны только для `tsc --noEmit` на
# машине разработчика; в образ они не едут — исполняется исходник как есть.
COPY package.json tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production

# Длинный опрос: ни одного входящего порта, ни одной метки traefik, DNS не нужен.
USER node

# Без --env-file: переменные приходят из env_file compose'а уже в окружении
# процесса. Флаг --env-file-if-exists=.env печатал бы в stderr «.env not found.
# Continuing without it.» — строку, которая читается оператором как поломка,
# хотя токен на месте (замер: с флагом эта строка стояла над успешным bot.start).
CMD ["node", "src/index.ts"]
