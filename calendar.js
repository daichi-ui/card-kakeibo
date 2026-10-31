// ===== カレンダー（ホーム・明細で共通） =====
//   日ごとの支出合計を省略せずに表示し、使った額が多い日ほど色を濃くする
//   日付をタップすると onPick(date)、月を変えると onMonth(month)
import { monthItems } from "./store.js";
import {
  today, addMonth, daysInMonth, parseDate, formatMonth, formatDayWeek, holidayName, WEEK, swipe
} from "./utils.js";

// 桁が多いときは文字を小さくする
function cellYen(v) {
  const text = v.toLocaleString("ja-JP");
  return `<span class="${text.length >= 7 ? "is-long" : ""}">${text}</span>`;
}

function gridHtml(month) {
  const t = today();
  const byDay = new Map();
  monthItems(month).forEach((i) => {
    if (i.excluded || i.amount === null || !Number.isFinite(Number(i.amount))) return;
    byDay.set(i.date, (byDay.get(i.date) || 0) + Number(i.amount));
  });
  const max = Math.max(1, ...[...byDay.values()]);

  const first = parseDate(`${month}-01`).getDay();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(`<span></span>`);
  for (let d = 1; d <= daysInMonth(month); d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    const w = (first + d - 1) % 7;
    const holiday = holidayName(date);
    const total = byDay.get(date);
    // 使った額の割合（0〜1）。小さな額でも見えるよう平方根でならす
    const heat = total > 0 ? Math.sqrt(total / max) : 0;
    const cls = [
      "cal-day",
      w === 0 || holiday ? "is-sun" : w === 6 ? "is-sat" : "",
      date === t ? "is-today" : "",
      date > t ? "is-future" : ""
    ].filter(Boolean).join(" ");
    cells.push(`
      <button type="button" class="${cls}" data-date="${date}" style="--heat:${heat.toFixed(2)};--i:${d}"
              aria-label="${formatDayWeek(date)}${holiday ? ` ${holiday}` : ""} ${total ? `${total}円` : "利用なし"}">
        <span class="cal-num">${d}</span>
        <span class="cal-amount">${total ? cellYen(total) : ""}</span>
      </button>`);
  }
  return cells.join("");
}

export function createCalendar(root, { onPick, onMonth } = {}) {
  root.classList.add("calendar");
  root.innerHTML = `
    <div class="cal-head">
      <h2 class="cal-title"></h2>
      <button type="button" class="cal-today" hidden>今日</button>
      <button type="button" class="cal-arrow" data-dir="-1" aria-label="前の月"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
      <button type="button" class="cal-arrow" data-dir="1" aria-label="次の月"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
    </div>
    <div class="cal-week-row">${WEEK.map((w, i) =>
      `<span class="${i === 0 ? "is-sun" : i === 6 ? "is-sat" : ""}">${w}</span>`).join("")}</div>
    <div class="cal-grid"></div>`;
  const titleEl = root.querySelector(".cal-title");
  const todayBtn = root.querySelector(".cal-today");
  const grid = root.querySelector(".cal-grid");
  let month = today().slice(0, 7);

  function render(dir = 0) {
    titleEl.textContent = formatMonth(month);
    todayBtn.hidden = month === today().slice(0, 7);
    grid.innerHTML = gridHtml(month);
    // 月を変えたときは、進んだ向きからすべり込ませる
    grid.classList.remove("slide-next", "slide-prev", "pop-in");
    void grid.offsetWidth;
    grid.classList.add(dir > 0 ? "slide-next" : dir < 0 ? "slide-prev" : "pop-in");
  }

  function go(m, dir) {
    if (m === month) return;
    month = m;
    render(dir);
    onMonth?.(month);
  }

  root.addEventListener("click", (e) => {
    const arrow = e.target.closest(".cal-arrow");
    if (arrow) return go(addMonth(month, Number(arrow.dataset.dir)), Number(arrow.dataset.dir));
    if (e.target.closest(".cal-today")) {
      const m = today().slice(0, 7);
      return go(m, m > month ? 1 : -1);
    }
    const day = e.target.closest("[data-date]");
    if (day) {
      day.classList.remove("is-tapped");
      void day.offsetWidth;
      day.classList.add("is-tapped");
      onPick?.(day.dataset.date);
    }
  });
  swipe(grid, (dir) => go(addMonth(month, dir), dir));

  return {
    get month() { return month; },
    setMonth(m) { go(m, m > month ? 1 : -1); },
    // データが変わったときは動きなしで描き直す
    refresh() {
      titleEl.textContent = formatMonth(month);
      todayBtn.hidden = month === today().slice(0, 7);
      grid.innerHTML = gridHtml(month);
    },
    render
  };
}
