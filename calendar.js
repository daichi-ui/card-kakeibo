// ===== カレンダー（明細タブの「カレンダー」表示） =====
// 日ごとの支出合計を省略せずに表示する。選んだ日は丸で囲む
import { monthItems } from "./store.js";
import { today, daysInMonth, parseDate, formatDayWeek, holidayName, WEEK } from "./utils.js";

// 桁が多いときは文字を小さくする
function cellYen(v) {
  const text = v.toLocaleString("ja-JP");
  return `<span class="${text.length >= 7 ? "is-long" : ""}">${text}</span>`;
}

export function calendarHtml(month, selected) {
  const t = today();
  const byDay = new Map();
  monthItems(month).forEach((i) => {
    if (i.excluded || i.amount === null || !Number.isFinite(Number(i.amount))) return;
    byDay.set(i.date, (byDay.get(i.date) || 0) + Number(i.amount));
  });

  const first = parseDate(`${month}-01`).getDay();
  const cells = WEEK.map((w, i) =>
    `<span class="cal-week ${i === 0 ? "is-sun" : i === 6 ? "is-sat" : ""}">${w}</span>`);
  for (let i = 0; i < first; i++) cells.push(`<span></span>`);
  for (let d = 1; d <= daysInMonth(month); d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    const w = (first + d - 1) % 7;
    const holiday = holidayName(date);
    const total = byDay.get(date);
    const cls = [
      "cal-day",
      w === 0 || holiday ? "is-sun" : w === 6 ? "is-sat" : "",
      date === t ? "is-today" : "",
      date === selected ? "is-selected" : ""
    ].filter(Boolean).join(" ");
    cells.push(`
      <button type="button" class="${cls}" data-date="${date}"
              aria-label="${formatDayWeek(date)}${holiday ? ` ${holiday}` : ""} ${total ? `${total}円` : "利用なし"}"
              aria-pressed="${date === selected}">
        <span class="cal-num">${d}</span>
        <span class="cal-amount">${total ? cellYen(total) : ""}</span>
      </button>`);
  }
  return `<div class="cal-grid">${cells.join("")}</div>`;
}
