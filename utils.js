// ===== 共通の設定と便利関数 =====

// 締め日と支払日（月末締め・翌月27日払い）
export const PAYMENT_DAY = 27;

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

// 利用した月 → 支払日（翌月27日）
export function paymentDateOf(month) {
  return `${addMonth(month, 1)}-${PAYMENT_DAY}`;
}

// 次の支払日と、その支払いに含まれる利用月
// 例：今日が 10/30 → 11/27 に 10月分を支払う。今日が 11/20 → 11/27 に 10月分
export function nextPayment(todayStr) {
  const month = todayStr.slice(0, 7);
  const day = Number(todayStr.slice(8, 10));
  const usageMonth = day <= PAYMENT_DAY ? addMonth(month, -1) : month;
  return { usageMonth, date: paymentDateOf(usageMonth) };
}

// 1180 → "¥1,180"、null → "—"
export function yen(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return "¥" + Math.round(Number(n)).toLocaleString("ja-JP");
}

// "2026-10" → "2026年10月"
export function formatMonth(month) {
  const [y, m] = month.split("-").map(Number);
  return `${y}年${m}月`;
}

// "2026-10-25" → "10月25日(日)"
export function formatDayWeek(str) {
  const d = parseDate(str);
  const week = ["日", "月", "火", "水", "木", "金", "土"].at(d.getDay());
  return `${d.getMonth() + 1}月${d.getDate()}日(${week})`;
}

// "2026-11-27" → "2026/11/27"
export function slashDate(str) {
  return str.replaceAll("-", "/");
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
