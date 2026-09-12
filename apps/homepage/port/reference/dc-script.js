class Component extends DCLogic {
  state = { audience: null, tab: 'install', step: 0, faqOpen: 0, blocks: { proof: false, frame: false, included: false, pricing: false, faq: false }, payPlan: null, payMoreOpen: -1, payTg: '', payTgErr: false, admin: false, pwOpen: false, pw: '', pwErr: false, menu: false };
  _lp = null;

  startPress = () => {
    clearTimeout(this._lp);
    this._lp = setTimeout(() => this.setState({ pwOpen: true, pw: '', pwErr: false }), 600);
  };
  endPress = () => clearTimeout(this._lp);
  submitPw = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (this.state.pw.trim() === '500p3r') {
      try { sessionStorage.setItem('upready_admin', '1'); } catch (x) {}
      this.setState({ admin: true, pwOpen: false, pwErr: false });
    } else {
      this.setState({ pwErr: true });
    }
  };

  tgHandle = () => (this.state.payTg || '').trim().replace(/^https?:\/\//, '').replace(/^t\.me\//, '').replace(/^@/, '');
  _onKey = (e) => { if (e.key === 'Escape' && (this.state.payPlan || this.state.pwOpen)) this.setState({ payPlan: null, pwOpen: false, payTgErr: false }); };
  setRail = (el) => { this._rail = el; };
  onRail = () => {
    const el = this._rail;
    if (!el) return;
    const first = el.firstElementChild;
    const w = first ? first.getBoundingClientRect().width + 1 : 441;
    const i = Math.min(5, Math.max(1, Math.round(el.scrollLeft / w) + 1));
    if (i !== this.state.slide) this.setState({ slide: i });
  };
  moveRail = (d) => this.scrollRail('rail-ops', this._rail, d);
  setLogoRail = (el) => { this._lrail = el; };
  setIncRail = (el) => { this._irail = el; };
  setCardRail = (el) => { this._crail = el; };
  setDelRail = (el) => { this._drail = el; };
  scrollRail = (id, el, d) => {
    const node = el || document.getElementById(id);
    if (!node) return;
    const first = node.firstElementChild;
    const step = first ? first.getBoundingClientRect().width + 1 : 340;
    node.scrollBy({ left: Math.sign(d) * step, behavior: 'smooth' });
  };
  moveLogoRail = (d) => this.scrollRail('rail-logos', this._lrail, d);

  get logos() {
    return [
      ['Eight Sleep', 'b2c', 'Оптимизация глобального фулфилмента через 10+ 3PL-операторов', '75dee92c69345c1fef6c121d05fa2827ac718398-120x40', '30px'],
      ['Heineken', 'b2b', 'От дистрибьюторов до обработки заказов конечных клиентов', '75183959297924e02f2b3046e3cc6a7555bcc8fa-117x28', '30px'],
      ['Inspired Pet Nutrition', 'b2b · ai', 'Экономия 80% затрат за счёт AI-обработки заказов из email', '4541bcc390a70129406188dc963768d1de22f309-87x39', '34px'],
      ['Redington', 'b2b', 'Автоматизация цифровых продаж на $4+ млрд через B2B-портал', 'a55da925de95f6c7077bb3f04c43ae8e9a3b5f85-120x40', '30px'],
      ['Mitsubishi Motors', 'b2c', 'Персонализированное послепродажное обслуживание покупателей новых автомобилей', '5aecaf36fe55321e848d3b0383fc5f5b0db35eb5-98x26', '26px'],
      ['Mandai', 'b2c', 'Продажа билетов: более 100 тыс. заказов в месяц', '6dfb7b674f03a0b1224cf34c4047681abff53fb7-120x40', '34px'],
      ['SPAR', 'b2c', 'Масштабирование quick commerce на 500+ магазинов', 'a8528b03a5bbade41055a0fee528c561c8e02865-120x40', '30px'],
      ['Material Bank', 'b2b', 'Единая коммерческая ОС для продаж дизайнерам текстиля', 'c58ffd30583c64dc85f7bea50ad70d8238b3a1ad-103x34', '32px'],
      ['Makro Pro', 'b2c · b2b', 'Обработка 5 000+ розничных заказов в вебе и приложении', 'd60d23ed7e0146238ed1a77ccdeb83cb16263cf6-97x26', '26px'],
      ['NIO', 'b2c', 'Онлайн-конфигуратор автомобилей для продаж электрокаров в регионе MENA', '01bcb697c14f9471aaabaee3b9678d0262974cfc-97x36', '32px']
    ].map(l => ({ name: l[0], tag: l[1], note: l[2], img: 'https://cdn.sanity.io/images/5a711ubd/production/' + l[3] + '.svg', h: l[4] }));
  }

  get opsSlides() {
    return [
      ['Продвинутое управление товарами', 'Создавайте насыщенные карточки товаров, собирайте бандлы и легко управляйте большими ассортиментами с помощью массового редактора.', '67d3428e87728ff87f57b95518bfcd75d841050b-2176x1960.jpg'],
      ['Множество каналов продаж', 'Настраивайте каналы продаж с разными правилами и товарами: мультимагазины, POS, приложения и не только.', 'ff1687455ac13ddce1156aafdb3d742aaeec67fb-2176x1960.jpg'],
      ['Склады и мультискладской учёт', 'Резервируйте товар под заказы, упрощайте сложный складской учёт и держите остатки синхронными между складами.', 'fa6f93d4932f3921211ccae6f3dae731fbf621d9-2176x1960.jpg'],
      ['Мультирегиональность по умолчанию', 'Добавляйте валюты, применяйте локальные налоговые правила и задавайте региональные настройки доставки, оплаты, скидок и не только.', '0f115511b4cbdc2894f7bfd0ed1fc57efda4e6a8-2176x1960.jpg'],
      ['Продвинутый движок промоакций', 'Настраивайте сложные правила промоакций: кампании, спеццены для клиентов и B2B, бесплатную доставку и не только.', '1d10f87a23c08d4b6dce0b7a496a2fdfdd6fe224-2176x1960.jpg']
    ].map((s, i) => ({ title: s[0], desc: s[1], img: 'https://cdn.sanity.io/images/5a711ubd/production/' + s[2] + '?w=800', n: String(i + 1).padStart(2, '0') }));
  }

  _onResize = () => {
    const w = window.innerWidth;
    const c = w >= 1100 ? 3 : w >= 760 ? 2 : 1;
    if (c !== this.state.cols || w !== this.state.vw) this.setState({ cols: c, vw: w });
  };

  componentDidMount() {
    let admin = false;
    try { admin = sessionStorage.getItem('upready_admin') === '1'; } catch (e) { admin = false; }
    this.setState({ audience: this.resolveAudience(), admin });
    let tg = '';
    try { tg = localStorage.getItem('upready_tg') || ''; } catch (e) { tg = ''; }
    if (tg) this.setState({ payTg: '@' + tg });
    this._onResize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('keydown', this._onKey);
  }
  componentWillUnmount() { clearTimeout(this._t); window.removeEventListener('resize', this._onResize); window.removeEventListener('keydown', this._onKey); }

  resolveAudience() {
    const ids = ['cold', 'warm', 'price'];
    const def = ids.includes(this.props.defaultAudience) ? this.props.defaultAudience : 'cold';
    let v = null;
    try {
      const q = new URLSearchParams(location.search);
      v = q.get('v') || q.get('utm_content');
      if (!v) {
        const raw = sessionStorage.getItem('upready_v');
        if (raw) {
          const s = JSON.parse(raw);
          if (s && Date.now() - s.t < 30 * 60 * 1000) v = s.v;
        }
      }
    } catch (e) { v = null; }
    const a = ids.includes(v) ? v : def;
    this.persist(a);
    return a;
  }
  persist(a) { try { sessionStorage.setItem('upready_v', JSON.stringify({ v: a, t: Date.now() })); } catch (e) {} }

  setAudience(a) { this.persist(a); this.setState({ audience: a }); }

  runTerminal() {
    clearTimeout(this._t);
    if (this.props.artifactAutoplay === false) { this.setState({ step: 99 }); return; }
    this.setState({ step: 0 });
    const tick = () => {
      this.setState(s => {
        const total = this.script(s.tab).length;
        if (s.step >= total) return null;
        this._t = setTimeout(tick, 240 + Math.random() * 320);
        return { step: s.step + 1 };
      });
    };
    this._t = setTimeout(tick, 320);
  }

  script(tab) {
    return tab === 'brand' ? [
      ['→', 'клонируем установку, применяем ваш бренд'],
      ['→', 'логотип, палитра, шрифты, тексты'],
      ['→', 'главная, карточка товара, чекаут — под бренд'],
      ['✓', 'письма и чеки в фирменном оформлении'],
      ['→', 'адаптив: мобильная версия и планшет'],
      ['✓', 'магазин выглядит как ваш, а не как шаблон'],
      ['✓', 'готово · 48 часов']
    ] : [
      ['→', 'домен подключён, https выпущен'],
      ['→', 'каталог: категории, карточки, варианты'],
      ['→', 'корзина и оформление заказа'],
      ['✓', 'оплата: 13+ способов, чеки по 54-фз'],
      ['✓', 'доставка: расчёт в чекауте, печать ярлыков'],
      ['→', 'панель управления, кабинет покупателя'],
      ['✓', 'магазин запущен · 24 часа']
    ];
  }

  get showcase() {
    return [
      ['dtc', 'Электроника', 'Магазин наушников', 'Тёмная витрина с предметной съёмкой: карточка товара, характеристики, корзина и оплата.', 'images/demo-electronics-20260910.webp', 'Главная страница демо-магазина наушников Ferrite: баннер и сетка категорий', 'https://ferrite.upready.dev'],
      ['dtc', 'Одежда', 'Магазин одежды', 'Размеры и цвета в одной карточке, сезонные подборки, быстрый чекаут.', 'images/demo-womens-fashion-20260910.webp', 'Главная страница демо-магазина одежды Larchant: баннер и сетка категорий', 'https://larchant.upready.dev'],
      ['dtc', 'Дом', 'Товары для дома', 'Витрина, где решает фотография: крупные кадры, спокойная типографика, минимум текста.', 'images/demo-home-goods-20260910.webp', 'Главная страница демо-магазина товаров для дома Long Morning', 'https://long-morning.upready.dev'],
      ['dtc', 'БАД', 'Магазин добавок', 'Состав и дозировки на видном месте, сертификат по номеру партии, простая навигация.', 'images/demo-supplements-20260910.webp', 'Главная страница демо-магазина пищевых добавок Scruple', 'https://scruple.upready.dev'],
      ['dtc', 'Обувь', 'Магазин кроссовок', 'Плотный каталог: фильтры по размеру и цвету, сортировка, подборки на главной.', 'images/demo-sneakers-20260910.webp', 'Главная страница демо-магазина кроссовок Kerbstone: баннер и каталог обуви', 'https://kerbstone.upready.dev']
    ];
  }

  get faqData() {
    return [
      ['Вы предлагаете уйти с Wildberries?', 'Нет. Wildberries остаётся вашим основным каналом. Магазин — второй, параллельный, на случай, когда первый недоступен.', ''],
      ['На сайт же никто не придёт. Зачем он?', 'В первый месяц — почти никто, и это нормально. Задача магазина не в том, чтобы завтра заменить трафик Wildberries, а в том, чтобы он уже существовал, когда понадобится. Плюс он собирает базу покупателей, которым можно продавать повторно без комиссии площадки.', ''],
      ['Почему так дёшево?', 'Мы не проектируем магазин с нуля. Мы разворачиваем готовое проверенное решение и настраиваем его под вас — вы платите за настройку и запуск, а не за разработку.', ''],
      ['У меня уже есть сайт, но он не работает.', 'Напишите — посмотрим, что чинить. Часто починить дешевле, чем ставить заново.', ''],
      ['Кому принадлежит магазин?', 'Вам. Домен, данные, каталог и база покупателей — ваши. Вы в любой момент можете забрать всё и работать с другим подрядчиком.', ''],
      ['А если мне не понравится?', 'Если сомневаетесь — начните с установки за 4 900 ₽, а оформление добавим позже, когда магазин уже будет работать. Условия возврата — в блоке «Цены».', ''],
      ['Как оплатить?', '', 'todo: payment_methods_answer']
    ];
  }

  get paymentData() {
    const QR = ['M4 4h6v6H4z', 'M14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2z'];
    const CARD = ['M2 6.5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z', 'M2 10h20'];
    const CARD2 = ['M2 6.5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z', 'M2 10h20M6 15h4'];
    const WALLET = ['M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M16 11h5v4h-5a2 2 0 0 1 0-4z'];
    const PHONE = ['M7 2.5h10a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1z', 'M10 18.5h4'];
    const BANK = ['M3 10 12 4.5 21 10', 'M5.5 10v9h13v-9M3 19h18'];
    const NFC = ['M7 8.5a7 7 0 0 1 0 7', 'M11 5.5a12 12 0 0 1 0 13M15 3a17 17 0 0 1 0 18'];
    const SPLIT = ['M3 6.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M12 4.5v15'];
    const COIN = ['M4 6h16v12H4z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'];
    const PIE = ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M12 3.5V12h8.5'];
    const CAL = ['M4 6.5h16V20H4z', 'M8 3.5v4M16 3.5v4M4 11h16'];
    const RECEIPT = ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6M9 12h6'];
    return [
      ['СБП', 'система быстрых платежей', QR],
      ['Карты МИР', 'эквайринг', CARD],
      ['Visa · Mastercard', 'эквайринг', CARD2],
      ['SberPay', 'кошелёк банка', WALLET],
      ['T-Pay', 'тинькофф', PHONE],
      ['Alfa Pay', 'альфа-банк', BANK],
      ['Mir Pay', 'nfc-оплата', NFC],
      ['Яндекс Пэй', 'кошелёк + сплит', SPLIT],
      ['ЮMoney', 'кошелёк', COIN],
      ['Долями', 'оплата частями', PIE],
      ['Подели', 'рассрочка', CAL],
      ['Мой налог', 'чеки нпд', RECEIPT]
    ].map(x => ({ name: x[0], kind: x[1], d1: x[2][0], d2: x[2][1] }));
  }

  get deliveryData() {
    const PIN = ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z', 'M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'];
    const MAIL = ['M3 6h18v12H3z', 'm3 7 9 6 9-6'];
    const LOCKER = ['M4.5 3h15v18h-15z', 'M4.5 9h15M4.5 15h15M8 6h2M8 12h2M8 18h2'];
    const CLOCK = ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M12 7.5V12l3.5 2'];
    const ROCKET = ['M12 2.5s5 3 5 9c0 3-2 6-5 10.5-3-4.5-5-7.5-5-10.5 0-6 5-9 5-9z', 'M12 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'];
    const TRUCK = ['M3 7h11v9H3z', 'M14 10h4l3 3v3h-2M5 16h1M6.5 19a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2zM17.5 19a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z'];
    const BOXES = ['M8.5 3h7v7h-7z', 'M3 13.5h8v7.5H3zM13 13.5h8v7.5h-8z'];
    const PALLET = ['M3 5h18v9H3z', 'M3 17h18M6 17v3M18 17v3'];
    const STORE = ['M4.5 9.5h15V20h-15z', 'M3 9.5 5 4.5h14l2 5M9.5 20v-6h5v6'];
    const GRID = ['M4 4h16v16H4z', 'M4 12h16M12 4v16'];
    const SCOOTER = ['M4 17a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0zM15 17a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0z', 'M9 17h5.5L12 8H9M14 8h3.5l2 6'];
    const PARCEL = ['M12 3 4 7.5v9L12 21l8-4.5v-9z', 'M4 7.5 12 12l8-4.5M12 12v9'];
    return [
      ['СДЭК', 'пвз · курьер', PIN, 'images/logos/cdek.png', '57px', '16px'],
      ['Почта России', 'отделения · курьер', MAIL, 'images/logos/pochta-rossii.svg', '45px', '22px'],
      ['Яндекс Доставка', 'курьер за 2 часа', CLOCK, 'images/logos/yandex-delivery.png', '68px', '22px'],
      ['5Post', 'постаматы пятёрочки', GRID, 'images/logos/5post.svg', '44px', '19px'],
      ['Достависта', 'день в день', SCOOTER, 'images/logos/dostavista.svg', '80px', '12px'],
      ['DPD', 'курьер по рф', TRUCK, 'images/logos/dpd-trim.svg', '50px', '22px'],
      ['Озон Доставка', 'пвз · постаматы', ROCKET],
      ['ПЭК', 'сборные грузы', BOXES],
      ['Деловые Линии', 'фуры · паллеты', PALLET],
      ['СберЛогистика', 'пвз · курьер', PARCEL],
      ['Самовывоз', 'ваш адрес', STORE]
    ].map(x => ({ name: x[0], kind: x[1], d1: x[2][0], d2: x[2][1], logo: x[3] || '', logoW: x[4] || '', logoH: x[5] || '', hasLogo: !!x[3], noLogo: !x[3] }));
  }

  get planData() {
    return [
      { id: 'install', tag: 'установка', title: 'Готовый магазин на вашем домене', price: '4 900', term: 'разово · за 24 часа', best: true,
        desc: 'Разворачиваем выбранный пример на вашем домене, подключаем приём оплаты и доставку и загружаем первые товары.',
        rows: ['Домен, HTTPS и мобильная версия', 'Витрина, корзина и оформление заказа — настроены и проверены', 'Приём оплаты привычными способами, чеки в налоговую', 'Расчёт доставки в чекауте и печать ярлыков', 'Загрузка 15 товаров: фото, описания, цены'],
        fine: 'возврат 7 дней', href: 'https://t.me/tribute' },
      { id: 'brand', tag: 'оформление', title: 'Оформление под ваш бренд', price: '9 900', term: 'к установке · за 48 часов', best: false,
        desc: 'Всё то же, что за 4 900 ₽, плюс доработка под ваш бренд: логотип, цвета, шрифты и тексты. Магазин выглядит как ваш, а не как шаблон.',
        rows: ['Всё из тарифа за 4 900 ₽', 'Загрузка до 40 товаров: фото, описания, цены', 'Логотип, палитра и шрифты', 'Главная, карточка товара и оформление заказа', 'Письма, чеки и баннеры в фирменном виде', 'Тексты о бренде, доставке и оплате'],
        fine: 'без возврата', href: 'https://t.me/tribute' }
    ];
  }

  renderVals() {
    const a = this.state.audience || (['cold', 'warm', 'price'].includes(this.props.defaultAudience) ? this.props.defaultAudience : 'cold');
    const accent = this.props.accentColor || '#2563EB';
    const showTodo = this.props.showTodoMarkers !== false;

    const heroCta = a === 'price' ? 'Написать в телеграм' : 'Поставить магазин';
    const heroNote = 'Не подойдёт — вернём деньги в течение 7 дней после запуска.';

    const tabBase = 'height:32px;padding:0 14px;border-radius:7px;font-size:12.5px;font-weight:500;letter-spacing:-.01em;transition:all .15s;border:1px solid transparent;';
    const tabs = [['install', 'Установка · 4 900 ₽'], ['brand', 'Оформление · 9 900 ₽']].map(([id, label]) => ({
      label, pick: () => { if (this.state.tab !== id) { this.setState({ tab: id }, () => this.runTerminal()); } },
      st: tabBase + (this.state.tab === id
        ? 'background:#fff;border-color:#E4E4E7;color:#18181B;box-shadow:0 1px 2px rgba(24,24,27,.12)'
        : 'background:transparent;color:#71717A')
    }));

    const term = this.script(this.state.tab).slice(0, this.state.step).map(([glyph, text]) => ({
      glyph, text, color: glyph === '✓' ? '#34D399' : '#52525B'
    }));

    const install = this.state.tab === 'install';
    const planRows = install
      ? [{ k: 'срок', v: '24 часа' }, { k: 'домен', v: 'ваш или подберём' }, { k: 'оплата и чеки', v: 'подключены' }, { k: 'гарантия', v: '7 дней' }]
      : [{ k: 'срок', v: '48 часов' }, { k: 'входит', v: 'вся установка' }, { k: 'бренд', v: 'логотип, цвета, шрифты' }, { k: 'гарантия', v: 'не распространяется' }];

    const cards = this.showcase
      .map(c => ({ cat: c[0], eyebrow: c[1], title: c[2], desc: c[3], img: c[4], alt: c[5], url: c[6] }));

    const faq = this.faqData.map((q, i) => ({
      q: q[0], a: q[1], todo: showTodo ? q[2] : '',
      toggle: () => this.setState(s => ({ faqOpen: s.faqOpen === i ? -1 : i })),
      rot: this.state.faqOpen === i ? 'rotate(45deg)' : 'rotate(0deg)',
      open: this.state.faqOpen === i
    }));

    const aBase = 'height:26px;padding:0 11px;border-radius:999px;font-family:Roboto Mono,monospace;font-size:11px;transition:all .15s;';
    const audienceBtns = [['cold', 'cold'], ['warm', 'warm'], ['price', 'price']].map(([id, label]) => ({
      label, pick: () => this.setAudience(id),
      st: aBase + (a === id ? 'background:#18181B;color:#fff' : 'background:transparent;color:#71717A')
    }));

    const b = this.state.blocks;
    const plans = this.planData.map(pl => Object.assign({}, pl, {
      open: () => this.setState({ payPlan: pl.id }),
      rows: pl.rows.map(t => ({ t })),
      btn: pl.best
        ? 'background:#2563EB;color:#fff;box-shadow:0 1px 2px rgba(24,24,27,.16)'
        : 'background:#18181B;color:#fff;box-shadow:0 1px 2px rgba(24,24,27,.24)'
    }));
    const plan = plans.find(x => x.id === this.state.payPlan) || null;
    const payMore = [
      ['Как подключается приём оплаты', [
        '01 — Статус продавца. Принимать оплату можно как ИП, ООО или самозанятый. Если статуса ещё нет, сначала регистрация: подскажем порядок и что выбрать под ваш товар.',
        '02 — Заявка в платёжный сервис. Нужны реквизиты, паспорт и сайт с офертой и политикой данных. Заявку собираем вместе.',
        '03 — Тестовый платёж. Подключаем ключи к магазину, проводим оплату на 1 ₽ и проверяем, что чек ушёл покупателю и в налоговую.'
      ]],
      ['Сколько это занимает', [
        'Если статус ИП, ООО или самозанятого уже есть — обычно 1–3 рабочих дня.',
        'Если статуса нет, сначала регистрация: это добавляет от одного дня до двух недель.',
        'Заявку проверяют платёжный сервис и банк, эти сроки от нас не зависят. Мы сразу говорим, что именно тормозит и как поправить.'
      ]],
      ['Чеки и налоговая', [
        'Чек уходит автоматически при оплате — покупателю и в налоговую по 54-ФЗ. Покупать или арендовать онлайн-кассу не нужно.',
        'Для самозанятых чеки формируются сами и передаются в «Мой налог» без вашего участия.'
      ]],
      ['Гарантия возврата', [
        'Если магазин не подошёл — вернём 4 900 ₽ в течение 7 дней после запуска, без объяснения причин. Магазин при этом отключается.',
        'Гарантия распространяется на установку. Оформление под бренд за 9 900 ₽ — работа под конкретного заказчика, возврату не подлежит.',
        'Если домен мы покупали для вас, его стоимость удерживается по факту — он остаётся вашим.'
      ]],
      ['Комиссия и оплата вне сайта', [
        'Комиссию за платежи берёт платёжный сервис: размер зависит от тарифа и оборота. Мы её не назначаем и не получаем.',
        'Кроме сайта работают платёжные ссылки, QR-коды и повторные списания для подписок — счёт можно выставить прямо в Telegram.'
      ]]
    ].map((m, k) => ({
      n: String(k + 1).padStart(2, '0'), title: m[0], lines: m[1].map(t => ({ t })),
      toggle: () => this.setState(s => ({ payMoreOpen: s.payMoreOpen === k ? -1 : k })),
      rot: this.state.payMoreOpen === k ? 'rotate(45deg)' : 'rotate(0deg)',
      open: this.state.payMoreOpen === k
    }));
    const order = [['plans', true], ['logos', true], ['proof', b.proof], ['frame', b.frame], ['included', b.included], ['ops', true], ['pricing', b.pricing], ['payments', true], ['delivery', true], ['showcase', true], ['faq', b.faq], ['tariffs', true]];
    const num = {};
    let ni = 0;
    order.forEach(([k, on]) => { if (on) { ni++; num[k] = String(ni).padStart(2, '0'); } });
    const cols = this.state.cols || 3;
    const w = this.state.vw || 1280;
    const cols4 = w >= 1200 ? 4 : w >= 900 ? 3 : w >= 620 ? 2 : 1;
    const pad = 2 * Math.min(56, Math.max(20, w * 0.04));
    const inner = Math.min(1280, w) - pad;
    const ffit = (min, n) => Math.max(1, Math.min(n, Math.floor(inner / min)));
    const gfit = (min, n) => 'repeat(' + ffit(min, n) + ',minmax(0,1fr))';
    const blockRows = [['proof', 'риск'], ['frame', 'рамка'], ['included', 'что входит'], ['pricing', 'цены'], ['faq', 'вопросы']].map(([k, label]) => ({
      label,
      toggle: () => this.setState(s => ({ blocks: Object.assign({}, s.blocks, { [k]: !s.blocks[k] }) })),
      track: b[k] ? 'background:#18181B;justify-content:flex-end' : 'background:#E4E4E7;justify-content:flex-start'
    }));

    return {
      accent,
      isCold: a === 'cold', isWarm: a === 'warm', isPrice: a === 'price',
      showProofFull: a === 'cold' && b.proof, showProofShort: a === 'warm' && b.proof, showFrame: b.frame,
      showIncluded: b.included, showPricing: b.pricing, showFaq: b.faq,
      payStop: (e) => { if (e && e.stopPropagation) e.stopPropagation(); },
      payTg: this.state.payTg,
      payTgChange: (e) => this.setState({ payTg: e.target.value, payTgErr: false }),
      payTgBorder: this.state.payTgErr ? '#FDBA74' : '#E4E4E7',
      payTgHint: this.state.payTgErr ? 'Укажите телеграм — без него мы не сможем связаться после оплаты.' : 'Никнейм или ссылка: @username или t.me/username.',
      payTgHintColor: this.state.payTgErr ? '#9A3412' : '#71717A',
      payTry: (e) => {
        const v = (this.state.payTg || '').trim().replace(/^https?:\/\//, '').replace(/^t\.me\//, '').replace(/^@/, '');
        if (!/^[a-zA-Z0-9_]{4,32}$/.test(v)) {
          if (e && e.preventDefault) e.preventDefault();
          this.setState({ payTgErr: true });
          return;
        }
        try { localStorage.setItem('upready_tg', v); } catch (x) {}
        this.setState({ payPlan: null, payMoreOpen: -1 });
      },
      plans, payOpen: !!plan, payTag: plan ? plan.tag : '', payTitle: plan ? plan.title : '', payPrice: plan ? plan.price : '',
      payRows: plan ? plan.rows : [], payHref: (plan ? plan.href : 'https://t.me/tribute') + (this.tgHandle() ? '?tg=' + this.tgHandle() : ''),
      closePay: () => this.setState({ payPlan: null, payMoreOpen: -1, payTg: '', payTgErr: false }),
      admin: this.state.admin, menu: this.state.menu, pwOpen: this.state.pwOpen, pw: this.state.pw,
      pwBorder: this.state.pwErr ? '#FDBA74' : '#E4E4E7',
      blockRows,
      startPress: this.startPress, endPress: this.endPress, submitPw: this.submitPw,
      pwChange: (e) => this.setState({ pw: e.target.value, pwErr: false }),
      closePw: () => this.setState({ pwOpen: false }),
      toggleMenu: () => this.setState(s => ({ menu: !s.menu })),
      logoClick: (e) => e.preventDefault(),
      heroCta, heroNote, audienceBtns,
      tabs, term,
      artifactStatus: install ? '24 часа' : '48 часов',
      planTag: install ? 'установка' : 'оформление',
      planTitle: install ? 'Готовый магазин на вашем домене' : 'Тот же магазин под вашим брендом',
      planSummary: install
        ? 'Выбираете пример из списка ниже — разворачиваем его на вашем домене, с оплатой, чеками и доставкой.'
        : 'То же самое плюс ваш логотип, цвета, шрифты и тексты: магазин выглядит как ваш, а не как шаблон.',
      planRows,
      planPrice: install ? '4 900 ₽' : '9 900 ₽',
      planFine: install
        ? 'Не подойдёт — вернём деньги в течение 7 дней после запуска. Магазин при этом отключается.'
        : 'Оформление под бренд — работа под конкретного заказчика, возврату не подлежит.',
      included: [
        'Магазин на вашем домене, с HTTPS и мобильной версией',
        'Каталог: категории, карточки товаров, варианты (размер, цвет, объём)',
        'Корзина и оформление заказа',
        'Приём оплаты 13+ способами и чеки в налоговую по 54-ФЗ',
        'Расчёт стоимости доставки прямо в чекауте и печать ярлыков',
        'Личный кабинет покупателя с историей заказов',
        'Панель управления: товары, заказы, остатки, скидки, промокоды',
        'Базовая SEO-разметка, sitemap, подключённая метрика'
      ].map((t, i) => ({ t, n: String(i + 1).padStart(2, '0'), isDomain: i === 0, isCatalog: i === 1, isCart: i === 2, isPay: i === 3, isShip: i === 4, isAccount: i === 5, isAdmin: i === 6, isSeo: i === 7, isStub: false })),
      extra: [
        { t: 'Перенос каталога с Wildberries (карточки, фото, описания) — от', todo: showTodo ? 'todo: catalog_migration_price' : '' },
        { t: 'Хостинг и домен —', todo: showTodo ? 'todo: hosting_monthly' : '' },
        { t: 'Комиссия платёжного сервиса —', todo: showTodo ? 'todo: payment_fee' : '' },
        { t: 'Реклама и продвижение', todo: '' }
      ],
      payGroups: [
        { tag: 'каждый день',
          brands: [['Карты МИР', 'pay-mir'], ['Visa', 'pay-visa'], ['СБП', 'pay-sbp']],
          note: 'QR-код, кнопка в приложении банка или карта на сайте — то, чем платят чаще всего.' },
        { tag: 'в один клик',
          brands: [['SberPay', 'pay-sberpay'], ['T-Pay', 'pay-tpay'], ['Alfa Pay', 'pay-alfapay'], ['МТС Pay', 'pay-mtspay'], ['Mir Pay', 'pay-mirpay'], ['Яндекс Пэй', 'pay-yandexpay'], ['ЮMoney', 'pay-yoomoney']],
          note: 'Оплата подтверждается в своём банке или кошельке — карту вводить не нужно.' },
        { tag: 'частями',
          brands: [['Яндекс Сплит', 'pay-split', '42px'], ['Подели', 'pay-podeli'], ['Мокка', 'pay-mokka', '45px'], ['Халва', 'pay-halva']],
          note: 'Покупатель делит платёж на части, вы получаете всю сумму сразу.' }
      ].map(g => Object.assign({}, g, {
        brands: g.brands.map(b => ({ name: b[0], logo: b[1] ? 'images/logos/' + b[1] + '.svg' : '', w: b[2] || '44px', hasLogo: !!b[1], noLogo: !b[1] }))
      })),
      payMore,
      delivery: this.deliveryData,
      cards, faq,
      logos: this.logos, opsSlides: this.opsSlides,
      slideLabel: 'слайд ' + (this.state.slide || 1) + ' / 5',
      setRail: this.setRail, onRail: this.onRail,
      setLogoRail: this.setLogoRail, setIncRail: this.setIncRail, setCardRail: this.setCardRail, setDelRail: this.setDelRail,
      prevDel: () => this.scrollRail('rail-delivery', this._drail, -209),
      nextDel: () => this.scrollRail('rail-delivery', this._drail, 209),
      prevInc: () => this.scrollRail('rail-included', this._irail, -341),
      nextInc: () => this.scrollRail('rail-included', this._irail, 341),
      prevCard: () => this.scrollRail('rail-cards', this._crail, -291),
      nextCard: () => this.scrollRail('rail-cards', this._crail, 291),
      gridServices: gfit(180, 4),
      prevLogo: () => this.moveLogoRail(-1), nextLogo: () => this.moveLogoRail(1),
      gridPlans: gfit(300, 2), gridPricing: gfit(280, 3), gridFaq: gfit(300, 2),
      fillersPricing: Array.from({ length: (ffit(280, 3) - (3 % ffit(280, 3))) % ffit(280, 3) }, (_, i) => i),
      prevSlide: () => this.moveRail(-1), nextSlide: () => this.moveRail(1),
      nLogos: num.logos, nOps: num.ops,
      nPlans: num.plans, nProof: num.proof, nFrame: num.frame, nIncluded: num.included, nPricing: num.pricing,
      nPayments: num.payments, nDelivery: num.delivery, nShowcase: num.showcase, nFaq: num.faq, nTariffs: num.tariffs,
      gridCols: 'repeat(' + cols + ',minmax(0,1fr))',
      gridCols4: 'repeat(' + cols4 + ',minmax(0,1fr))',
      fillers4: Array.from({ length: (cols4 - (8 % cols4)) % cols4 }, (_, i) => i),
      fillers: Array.from({ length: (cols - (cards.length % cols)) % cols }, (_, i) => i)
    };
  }
}
