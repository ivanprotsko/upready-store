import LockIcon from "./LockIcon";
import styles from "./styles.module.css";

/**
 * Иллюстрация «Независимость» — свой адрес, свои покупатели, свои данные
 * (бриф §5.3). Окно панели владельца с тремя плашками. Прототип, строки
 * 280-291. Числа иллюстративные, отсюда подпись «пример».
 */
interface Plate {
  key: string;
  value: string;
  note: string;
  action: string;
}

const PLATES: Plate[] = [
  { key: "Покупатели", value: "1 248", note: "контактов в вашей базе", action: "выгрузить" },
  { key: "Заказы и выручка", value: "318", note: "за месяц · на ваш счёт", action: "экспорт" },
  {
    key: "Каталог и данные",
    value: "312",
    note: "товаров · открытый движок Medusa",
    action: "забрать целиком",
  },
];

export default function IllOwner() {
  return (
    <>
      <div className={styles.win}>
        <div className={styles.winBar}>
          <i className={styles.dot} />
          <i className={styles.dot} />
          <i className={styles.dot} />
          <div className={styles.addr}>
            <LockIcon />
            вашбренд.ru — панель владельца
          </div>
        </div>
        <div className={styles.plates}>
          {PLATES.map((plate) => (
            <div key={plate.key} className={styles.plate}>
              <div>
                <div className={styles.k}>{plate.key}</div>
                <div className={styles.v}>
                  {plate.value}
                  <small>{plate.note}</small>
                </div>
              </div>
              <a className={styles.a} href="#hero">
                {plate.action}
              </a>
            </div>
          ))}
        </div>
      </div>
      <span className={styles.ex}>пример</span>
    </>
  );
}
