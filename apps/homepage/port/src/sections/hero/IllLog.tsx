import styles from "./styles.module.css";

/**
 * Иллюстрация «Стабильность» — только ваши записи (бриф §5.2).
 * Журнал изменений магазина, у каждой строки «вернуть»; внизу перечёркнутое
 * уведомление маркетплейса. Прототип, строки 266-278.
 *
 * Числа и даты — иллюстративные, поэтому в углу стоит подпись «пример».
 */
interface LogRow {
  date: string;
  title: string;
  meta: string;
  /** `null` — изменение уже возвращено, ссылки нет. */
  action: string | null;
}

const ROWS: LogRow[] = [
  { date: "12 сен", title: "Тема «Графит», тёмная", meta: "вы · оформление", action: "↶ вернуть" },
  { date: "9 сен", title: "Баннер «Осень −20 %»", meta: "вы · главная", action: "↶ вернуть" },
  {
    date: "3 сен",
    title: "Цена «Куртка Nord» 8 900 → 7 900 ₽",
    meta: "вы · каталог",
    action: null,
  },
];

export default function IllLog() {
  return (
    <>
      <div className={styles.log}>
        <div className={styles.logH}>
          Журнал изменений <span>вашбренд.ru</span>
        </div>
        {ROWS.map((row) => (
          <div key={row.date} className={styles.row}>
            <span className={`${styles.d} mono`}>{row.date}</span>
            <span className={styles.t}>
              {row.title}
              <small>{row.meta}</small>
            </span>
            {row.action ? (
              <a className={styles.u} href="#hero">
                {row.action}
              </a>
            ) : (
              <span className={`${styles.u} ${styles.uDone}`}>возвращено</span>
            )}
          </div>
        ))}
      </div>

      <div className={styles.mp}>
        <b>Маркетплейс · уведомление</b>Условия сотрудничества изменились. Новая редакция вступает в
        силу с 1-го числа.
      </div>
      <div className={styles.mpCap}>не про ваш магазин</div>
      <span className={styles.ex}>пример</span>
    </>
  );
}
