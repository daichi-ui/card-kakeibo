// ===== 共通の設定と便利関数 =====

// 締め日と支払日（月末締め・翌月25日払い。25日が土日祝なら翌営業日）
export const PAYMENT_DAY = 25;

// Date → "2026-10-25"（日本時間のまま）
export function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// "2026-10-25" → Date
export function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function today() {
  return toDateStr(new Date());
}

// "2026-10-25" に n 日足す
export function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

// "2026-10" に n か月足す（例：addMonth("2026-12", 1) → "2027-01"）
export function addMonth(month, n) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// その月の日数
export function daysInMonth(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

// ===== 日本の祝日 =====
// 内閣府の「国民の祝日」の決まりを計算で求める（1980〜2099年に対応）
const holidayCache = new Map();

function nthMonday(y, m, n) {
  const first = new Date(y, m - 1, 1).getDay();
  return 1 + ((8 - first) % 7) + (n - 1) * 7;
}

function holidaysOf(y) {
  if (holidayCache.has(y)) return holidayCache.get(y);
  const pad = (v) => String(v).padStart(2, "0");
  const key = (m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const base = y - 1980;
  const spring = Math.floor(20.8431 + 0.242194 * base - Math.floor(base / 4));
  const autumn = Math.floor(23.2488 + 0.242194 * base - Math.floor(base / 4));

  const map = new Map([
    [key(1, 1), "元日"],
    [key(1, nthMonday(y, 1, 2)), "成人の日"],
    [key(2, 11), "建国記念の日"],
    [key(2, 23), "天皇誕生日"],
    [key(3, spring), "春分の日"],
    [key(4, 29), "昭和の日"],
    [key(5, 3), "憲法記念日"],
    [key(5, 4), "みどりの日"],
    [key(5, 5), "こどもの日"],
    [key(7, nthMonday(y, 7, 3)), "海の日"],
    [key(8, 11), "山の日"],
    [key(9, nthMonday(y, 9, 3)), "敬老の日"],
    [key(9, autumn), "秋分の日"],
    [key(10, nthMonday(y, 10, 2)), "スポーツの日"],
    [key(11, 3), "文化の日"],
    [key(11, 23), "勤労感謝の日"]
  ]);

  // 国民の休日：祝日にはさまれた平日（例：2026/9/22）
  [...map.keys()].forEach((d) => {
    const mid = addDays(d, 1);
    if (!map.has(mid) && map.has(addDays(d, 2)) && parseDate(mid).getDay() !== 0) {
      map.set(mid, "国民の休日");
    }
  });

  // 振替休日：日曜日の祝日のあと、最初の祝日でない日
  [...map.keys()].sort().forEach((d) => {
    if (parseDate(d).getDay() !== 0) return;
    let next = addDays(d, 1);
    while (map.has(next)) next = addDays(next, 1);
    map.set(next, "振替休日");
  });

  holidayCache.set(y, map);
  return map;
}

// 祝日の名前（祝日でなければ null）
export function holidayName(str) {
  return holidaysOf(Number(str.slice(0, 4))).get(str) || null;
}

// 土日祝・年末年始（12/31〜1/3）は金融機関の休業日
export function isBankHoliday(str) {
  const w = parseDate(str).getDay();
  const md = str.slice(5);
  return w === 0 || w === 6 || !!holidayName(str) ||
    md === "12-31" || md === "01-01" || md === "01-02" || md === "01-03";
}

// 利用した月 → 支払日（翌月25日。休業日なら翌営業日）
export function paymentDateOf(month) {
  let date = `${addMonth(month, 1)}-${PAYMENT_DAY}`;
  while (isBankHoliday(date)) date = addDays(date, 1);
  return date;
}

// 支払日が休業日のためにずれたか
export function isPaymentShifted(month) {
  return paymentDateOf(month) !== `${addMonth(month, 1)}-${PAYMENT_DAY}`;
}

// 次の支払日と、その支払いに含まれる利用月
// 例：今日が 11/10 → 11/25 に 10月分を支払う。今日が 11/26 → 12/25 に 11月分
export function nextPayment(todayStr) {
  const month = todayStr.slice(0, 7);
  const lastMonth = addMonth(month, -1);
  const usageMonth = todayStr <= paymentDateOf(lastMonth) ? lastMonth : month;
  return { usageMonth, date: paymentDateOf(usageMonth), shifted: isPaymentShifted(usageMonth) };
}

// ===== 表示 =====

// 文字で使う金額：1180 → "1,180円"、-2400 → "−2,400円"、null → "—"
export function yen(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  const v = Math.round(Number(n));
  return (v < 0 ? "−" : "") + Math.abs(v).toLocaleString("ja-JP") + "円";
}

// 差額：+1,200円 / −800円 / ±0円
export function signedYen(n) {
  const v = Math.round(Number(n) || 0);
  if (v === 0) return "±0円";
  return (v > 0 ? "+" : "−") + Math.abs(v).toLocaleString("ja-JP") + "円";
}

// 画面に表示する金額（HTML）。「円」は数字より小さく表示する
//   size: "xl" / "l" / "m" / "s"
export function price(n, size = "m") {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) {
    return `<span class="price price-${size} is-empty">—</span>`;
  }
  const v = Math.round(Number(n));
  return `<span class="price price-${size}${v < 0 ? " is-minus" : ""}">` +
    `<span class="price-num">${v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("ja-JP")}</span>` +
    `<span class="price-yen">円</span></span>`;
}

// "2026-10" → "2026年10月"
export function formatMonth(month) {
  const [y, m] = month.split("-").map(Number);
  return `${y}年${m}月`;
}

export const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

// "2026-10-25" → "10月25日(日)"
export function formatDayWeek(str) {
  const d = parseDate(str);
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEK.at(d.getDay())})`;
}

// "2026-11-25" → "2026/11/25(水)"
export function slashDate(str) {
  return `${str.replaceAll("-", "/")}(${WEEK.at(parseDate(str).getDay())})`;
}

// カテゴリの表記をそろえる（全角英数→半角、前後の空白を除く）
export function normalizeCategory(str) {
  const v = String(str ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return v || "未分類";
}

// 画面に表示する文字の安全対策（HTMLとして解釈させない）
export function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// ===== 左右のスワイプで前後に移動（カレンダー・レポート） =====
export function swipe(el, onSwipe) {
  let x0 = null, y0 = null;
  el.addEventListener("touchstart", (e) => {
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
  }, { passive: true });
}
