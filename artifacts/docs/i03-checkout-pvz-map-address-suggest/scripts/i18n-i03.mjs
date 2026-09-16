// i03: добавляет 4 ключа секции CdekPoint во все 36 каталогов витрины.
import fs from "node:fs"
import path from "node:path"

const DIR = process.argv[2]
const T = {
  ar: ["قائمة", "خريطة", "لا توجد نقاط على الخريطة لهذه المدينة.", "الخريطة غير متاحة. اختر نقطة من القائمة."],
  bg: ["Списък", "Карта", "За този град няма точки на картата.", "Картата не е достъпна. Изберете точка от списъка."],
  bn: ["তালিকা", "মানচিত্র", "এই শহরের জন্য মানচিত্রে কোনো পয়েন্ট নেই।", "মানচিত্র পাওয়া যাচ্ছে না। তালিকা থেকে একটি পয়েন্ট বেছে নিন।"],
  cs: ["Seznam", "Mapa", "Pro toto město nejsou na mapě žádná místa.", "Mapa není dostupná. Vyberte místo ze seznamu."],
  da: ["Liste", "Kort", "Der er ingen afhentningssteder på kortet for denne by.", "Kortet er ikke tilgængeligt. Vælg et sted fra listen."],
  de: ["Liste", "Karte", "Für diese Stadt sind keine Punkte auf der Karte vorhanden.", "Die Karte ist nicht verfügbar. Wählen Sie einen Punkt aus der Liste."],
  el: ["Λίστα", "Χάρτης", "Δεν υπάρχουν σημεία στον χάρτη για αυτήν την πόλη.", "Ο χάρτης δεν είναι διαθέσιμος. Επιλέξτε σημείο από τη λίστα."],
  en: ["List", "Map", "No pickup points to show on the map for this city.", "The map is unavailable. Pick a point from the list."],
  es: ["Lista", "Mapa", "No hay puntos en el mapa para esta ciudad.", "El mapa no está disponible. Elige un punto de la lista."],
  fi: ["Lista", "Kartta", "Tälle kaupungille ei ole noutopisteitä kartalla.", "Kartta ei ole käytettävissä. Valitse piste listalta."],
  fr: ["Liste", "Carte", "Aucun point relais à afficher sur la carte pour cette ville.", "La carte est indisponible. Choisissez un point dans la liste."],
  he: ["רשימה", "מפה", "אין נקודות איסוף להצגה במפה עבור עיר זו.", "המפה אינה זמינה. בחרו נקודה מהרשימה."],
  hi: ["सूची", "मानचित्र", "इस शहर के लिए मानचित्र पर कोई पिकअप पॉइंट नहीं है।", "मानचित्र उपलब्ध नहीं है। सूची से एक पॉइंट चुनें।"],
  hu: ["Lista", "Térkép", "Ehhez a városhoz nincs átvételi pont a térképen.", "A térkép nem érhető el. Válasszon pontot a listából."],
  id: ["Daftar", "Peta", "Tidak ada titik ambil di peta untuk kota ini.", "Peta tidak tersedia. Pilih titik dari daftar."],
  it: ["Elenco", "Mappa", "Nessun punto di ritiro da mostrare sulla mappa per questa città.", "La mappa non è disponibile. Scegli un punto dall'elenco."],
  ja: ["一覧", "地図", "この都市では地図に表示できる受取店舗がありません。", "地図を利用できません。一覧から受取店舗を選んでください。"],
  ka: ["სია", "რუკა", "ამ ქალაქისთვის რუკაზე გასაცემი პუნქტები არ არის.", "რუკა მიუწვდომელია. აირჩიეთ პუნქტი სიიდან."],
  ko: ["목록", "지도", "이 도시에는 지도에 표시할 픽업 장소가 없습니다.", "지도를 사용할 수 없습니다. 목록에서 장소를 선택하세요."],
  lt: ["Sąrašas", "Žemėlapis", "Šiam miestui žemėlapyje atsiėmimo punktų nėra.", "Žemėlapis nepasiekiamas. Pasirinkite punktą iš sąrašo."],
  mn: ["Жагсаалт", "Газрын зураг", "Энэ хотод газрын зураг дээр харуулах цэг алга.", "Газрын зураг ажиллахгүй байна. Жагсаалтаас цэг сонгоно уу."],
  ms: ["Senarai", "Peta", "Tiada pusat pengambilan untuk ditunjukkan pada peta bagi bandar ini.", "Peta tidak tersedia. Pilih pusat daripada senarai."],
  nb: ["Liste", "Kart", "Ingen hentesteder å vise på kartet for denne byen.", "Kartet er utilgjengelig. Velg et hentested fra listen."],
  nl: ["Lijst", "Kaart", "Geen afhaalpunten om op de kaart te tonen voor deze stad.", "De kaart is niet beschikbaar. Kies een punt uit de lijst."],
  pl: ["Lista", "Mapa", "Dla tego miasta nie ma punktów odbioru na mapie.", "Mapa jest niedostępna. Wybierz punkt z listy."],
  pt: ["Lista", "Mapa", "Não há pontos de retirada para mostrar no mapa desta cidade.", "O mapa está indisponível. Escolha um ponto na lista."],
  ro: ["Listă", "Hartă", "Nu există puncte de ridicare de afișat pe hartă pentru acest oraș.", "Harta nu este disponibilă. Alege un punct din listă."],
  ru: ["Список", "Карта", "В этом городе нет пунктов, которые можно показать на карте.", "Карта недоступна — выберите пункт из списка."],
  sk: ["Zoznam", "Mapa", "Pre toto mesto nie sú na mape žiadne výdajné miesta.", "Mapa nie je dostupná. Vyberte miesto zo zoznamu."],
  sv: ["Lista", "Karta", "Det finns inga utlämningsställen att visa på kartan för den här staden.", "Kartan är inte tillgänglig. Välj ett ställe i listan."],
  th: ["รายการ", "แผนที่", "ไม่มีจุดรับสินค้าให้แสดงบนแผนที่สำหรับเมืองนี้", "ใช้แผนที่ไม่ได้ กรุณาเลือกจุดรับสินค้าจากรายการ"],
  tl: ["Listahan", "Mapa", "Walang pickup point na maipapakita sa mapa para sa lungsod na ito.", "Hindi available ang mapa. Pumili ng pickup point sa listahan."],
  tr: ["Liste", "Harita", "Bu şehir için haritada gösterilecek teslim noktası yok.", "Harita kullanılamıyor. Listeden bir nokta seçin."],
  uk: ["Список", "Карта", "У цьому місті немає пунктів, які можна показати на карті.", "Карта недоступна — оберіть пункт зі списку."],
  vi: ["Danh sách", "Bản đồ", "Không có điểm nhận hàng nào để hiển thị trên bản đồ cho thành phố này.", "Không dùng được bản đồ. Hãy chọn điểm nhận hàng trong danh sách."],
  zh: ["列表", "地图", "该城市没有可在地图上显示的自提点。", "地图不可用，请从列表中选择自提点。"],
}
const KEYS = ["tabList", "tabMap", "mapEmpty", "mapFailed"]
let touched = 0
for (const [locale, values] of Object.entries(T)) {
  const file = path.join(DIR, `${locale}.json`)
  const json = JSON.parse(fs.readFileSync(file, "utf8"))
  if (!json.CdekPoint) throw new Error(`no CdekPoint section in ${locale}.json`)
  KEYS.forEach((key, i) => { json.CdekPoint[key] = values[i] })
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n")
  touched++
}
const missing = fs.readdirSync(DIR).filter((f) => f.endsWith(".json") && !T[f.replace(".json", "")])
console.log(`каталогов обновлено: ${touched}, ключей в каждом: ${KEYS.length}`)
console.log(`каталогов без перевода: ${missing.length}${missing.length ? " → " + missing.join(", ") : ""}`)
