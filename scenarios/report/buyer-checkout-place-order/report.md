# Scenario failed: buyer-checkout-place-order

- Goal: Оформляю заказ из корзины: адрес, доставка, оплата, и вижу страницу «заказ принят»
- Why (the agent): После «Войти» на оформлении форма адреса появляется через 7-8 с (бюджет шага 5 с): backend отвечает за доли секунды, а страница ждёт цепочку последовательных запросов (привязка корзины 1,7 с, способы доставки 1 с дважды, telegram-bot до 0,7 с). Заказ при этом оформляется (подтверждено живым проходом), но шаг s8 не укладывается в бюджет на production-сборке
- Step: 8 (s8) — Ввожу адрес доставки
- Profile: desktop-mouse
- Run: r-20261027-234640-83ee (rewalk)
- Scenario file: /Users/ivanprotsko/upready/worktrees/upready-store/feat/t28-26-sc-store/scenarios/buyer-checkout-place-order.json — unchanged, version 2
- Shot: /tmp/claude-1001/-Users-ivanprotsko-upready-worktrees-upready-store-feat-t28-26-sc-store/2847162f-6ec7-430d-b53b-f3038b33a61b/scratchpad/rw2/r-20261027-234640-83ee/report.png

## Expected

- step s8: Ввожу адрес доставки → text:Заполните обязательные поля адреса: Почтовый индекс и Город.
- re-walk section s8 to s22: Ввожу адрес доставки; Ввожу почтовый индекс; Ввожу город; Открываю список областей; Выбираю Москву в списке; Сохраняю адрес: далее; Выбираю самовывоз; Сохраняю контакты: далее; Ввожу номер демо-карты; Ввожу срок действия; Ввожу CVC; Прокручиваю к кнопке оплаты; Даю согласие на обработку данных; Оплачиваю заказ демо-картой
- final: url:^/ru/order/[^/]+/confirmed$
- final: text:Заказ подтверждён

## Seen

- url: http://scgate.localhost:8010/ru/checkout?step=address
- title: Оформление заказа | Тестовый магазин
- final not met: url:^/ru/order/[^/]+/confirmed$
- final not met: text:Заказ подтверждён
- visible error: *

Visible text:

    ТЕСТОВЫЙ МАГАЗИН
    МТ
    buyer-scgate@example.test
    Вход в личный кабинет
    Вы вошли как Мария Тестова, адрес эл. почты: buyer-scgate@example.test
    Изменить
    Адрес доставки
    Адрес
    *
    Почтовый индекс
    *
    Город
    *
    Область
    Москва
    Санкт-Петербург
    Севастополь
    Московская область
    Ленинградская область
    Адыгея

Last observation: /tmp/claude-1001/-Users-ivanprotsko-upready-worktrees-upready-store-feat-t28-26-sc-store/2847162f-6ec7-430d-b53b-f3038b33a61b/scratchpad/rw2/r-20261027-234640-83ee/obs/001.jpg, /tmp/claude-1001/-Users-ivanprotsko-upready-worktrees-upready-store-feat-t28-26-sc-store/2847162f-6ec7-430d-b53b-f3038b33a61b/scratchpad/rw2/r-20261027-234640-83ee/obs/001.txt
