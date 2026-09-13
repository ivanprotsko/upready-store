import { useEffect, useState } from "react";

import LockIcon from "./LockIcon";
import styles from "./styles.module.css";
import { LOOK_MS } from "./data";

/**
 * Иллюстрация «Свобода» — один магазин, любой вид (бриф §5.1).
 * Мини-витрина сама переключает три вида раз в 1,4 с, рядом стоит чат
 * владельца. Прототип, строки 246-264 и 468-474.
 */
const LOOKS = ["lookA", "lookB", "lookC"] as const;

export default function IllStore({ reduced }: { reduced: boolean }) {
  const [look, setLook] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setLook((current) => (current + 1) % LOOKS.length), LOOK_MS);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <>
      <div className={styles.win}>
        <div className={styles.winBar}>
          <i className={styles.dot} />
          <i className={styles.dot} />
          <i className={styles.dot} />
          <div className={styles.addr}>
            <LockIcon />
            вашбренд.ru
          </div>
        </div>
        <div className={`${styles.store} ${styles[LOOKS[look]]}`} data-look={LOOKS[look]}>
          <div className={styles.sHead}>
            <i className={styles.sLogo} />
            <div className={styles.sNav}>
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className={styles.sBanner}>
            <div>
              <b />
              <i />
            </div>
            <span className={styles.sBadge}>−20 %</span>
          </div>
          <div className={styles.sGrid}>
            {[0, 1, 2, 3].map((tile) => (
              <div key={tile} className={styles.sTile}>
                <div className={styles.img} />
                <div className={styles.t1} />
                <div className={styles.t2} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.chat}>
        <div className={`${styles.bub} ${styles.bubMe}`}>Сделай тёмную тему и баннер со скидкой</div>
        <div className={`${styles.bub} ${styles.bubAi}`}>
          Готово.<u>↶ вернуть прежний вид</u>
        </div>
      </div>
    </>
  );
}
