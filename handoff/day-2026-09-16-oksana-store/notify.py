#!/usr/bin/env python3
# notify.py — шлёт Ивану в его же «Избранное» (Saved Messages, получатель 'me') сводку REPORT.md через юзербот Telethon
# (.tg_session_cc; паттерн reference_userbot_send_channel). Никому, кроме самого Ивана, ничего не уходит.
# Вызов: notify.py [--force]. Без --force шлёт не чаще раза в час и только если сводка изменилась.
import asyncio, hashlib, pathlib, re, sys, time
M = pathlib.Path(__file__).resolve().parent
CP = pathlib.Path('/Users/ivanprotsko/upready/projects/tg-reply-copilot')
STAMP = M / 'logs' / 'notify.stamp'
rep = M / 'REPORT.md'
if not rep.exists(): print('no report'); sys.exit(0)
txt = rep.read_text()
head = txt.split('## Задачи')[0]
digest = hashlib.md5(head.encode()).hexdigest()
last = STAMP.read_text().split() if STAMP.exists() else ['0', '']
force = '--force' in sys.argv
if not force and (time.time() - float(last[0]) < 3600 or (len(last) > 1 and last[1] == digest)): print('skip'); sys.exit(0)
ENV = (CP / '.env').read_text()
def env(k):
    m = re.search(r'^' + k + r'=(.*)$', ENV, re.M); return m.group(1).strip().strip('"').strip("'") if m else None
from telethon import TelegramClient
from telethon.sessions import StringSession
body = head.strip()
if len(body) > 3800: body = body[:3800] + '\n…(полный отчёт: REPORT.md / http://localhost:5390)'
async def main():
    async with TelegramClient(StringSession((CP / '.tg_session_cc').read_text().strip()), int(env('TG_API_ID')), env('TG_API_HASH')) as c:
        me = await c.get_me()
        if me.username != 'ivanprotsko': print('ABORT: wrong account', me.username); sys.exit(2)
        await c.send_message('me', '🛠 Штаб дня (магазин Оксаны)\n\n' + body, link_preview=False)
        STAMP.parent.mkdir(exist_ok=True); STAMP.write_text(f'{time.time()} {digest}')
        print('sent', len(body))
asyncio.run(main())
