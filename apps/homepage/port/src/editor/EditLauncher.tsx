import { createPortal } from "react-dom";

import styles from "./editor.module.css";
import { PencilIcon } from "./icons";

/**
 * Кнопка входа в режим редактирования. Рендерится только на dev-сервере —
 * записывать раскладку умеет лишь он (plugins/homepage-config.ts).
 */
export default function EditLauncher({ onEnter }: { onEnter: () => void }) {
  return createPortal(
    <button type="button" className={`${styles.root} ${styles.launcher}`} onClick={onEnter}>
      <PencilIcon />
      Режим редактирования
    </button>,
    document.body,
  );
}
