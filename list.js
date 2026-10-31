// ===== 明細 =====
//   月の合計と支払日、「リスト」「カレンダー」の切り替え
//   検索・絞り込みは虫めがねボタンで開く
import { state, subscribe, monthItems, sum, reviewItems } from "./store.js";
import { rowHtml, bindRows } from "./rows.js";
import { calendarHtml } from "./calendar.js";
import {
  today, addMonth, paymentDateOf, yen, price, formatMonth, formatDayWeek, slashDate, swipe, holidayName
} from "./utils.js";

const titleEl = document.getElementById("listMonth");
const summaryEl = document.getElementById("listSummary");
const viewEl = document.getElementById("listView");
const searchArea = document.getElementById("listSearchArea");
const searchBtn = document.getElementById("listSearchBtn");
const searchEl = document.getElementById("listSearch");
const filterEl = document.getElementById("listFilter");
const bodyEl = document.getElementById("listBody");

let month = today().slice(0, 7);
let view = "list";          // "list" | "calendar"
let selected = today();     // カレンダーで選んでいる日
let filter = "all";

const FILTERS = {
  all: () => true,
  review: (i) => i.needsReview,
  fixed: (i) => i.type === "fixed",
  manual: (i) => i.source === "manual",
  excluded: (i) => i.excluded
};

subscribe(render);
bindRows(bodyEl);

function setMonth(m) {
  month = m;
  // 今月なら今日、ほかの月は1日を選ぶ
  selected = today().startsWith(month) ? today() : `${month}-01`;
  render();
}

document.getElementById("listPrev").addEventListener("click", () => setMonth(addMonth(month, -1)));
document.getElementById("listNext").addEventListener("click", () => setMonth(addMonth(month, 1)));
swipe(summaryEl, (dir) => setMonth(addMonth(month, dir)));

viewEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-view]");
  if (!btn) return;
  view = btn.dataset.view;
  render();
});

searchBtn.addEventListener("click", () => {
  const open = searchArea.hidden;
  searchArea.hidden = !open;
  searchBtn.classList.toggle("is-active", open);
  if (open) {
    searchEl.focus();
  } else {
    searchEl.value = "";
    setFilter("all");
  }
  render();
});
// 検索・絞り込みはリスト表示で行う
searchEl.addEventListener("input", () => { view = "list"; render(); });

function setFilter(name) {
  filter = name;
  filterEl.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("is-active", b.dataset.filter === filter));
}
filterEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter]");
  if (!btn) return;
  setFilter(btn.dataset.filter);
  view = "list";
  render();
});

bodyEl.addEventListener("click", (e) => {
  const day = e.target.closest("[data-date]");
  if (!day) return;
  selected = day.dataset.date;
  render();
});

// ホームから、指定の月（と絞り込み）を開く
window.addEventListener("open-month", (e) => {
  if (e.detail.tab !== "list") return;
  if (e.detail.filter) {
    searchArea.hidden = false;
    searchBtn.classList.add("is-active");
    setFilter(e.detail.filter);
    view = "list";
  }
  setMonth(e.detail.month);
});

// ＋ボタンで追加するときの日付（カレンダー表示中は選んだ日）
export function addDate() {
  if (view === "calendar") return selected;
  return today().startsWith(month) ? today() : `${month}-01`;
}

function render() {
  titleEl.textContent = formatMonth(month);
  viewEl.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
  if (!state.user) {
    summaryEl.innerHTML = bodyEl.innerHTML = "";
    return;
  }

  const all = monthItems(month);
  summaryEl.innerHTML = `
    ${price(sum(all), "xl")}
    <span class="month-sum-meta">${slashDate(paymentDateOf(month))} 支払い ・ ${all.filter((i) => !i.excluded).length}件</span>`;

  // 要確認の数を絞り込みボタンに出す
  const reviewBtn = filterEl.querySelector('[data-filter="review"]');
  const reviews = reviewItems().filter((r) => r.date?.startsWith(month)).length;
  reviewBtn.textContent = reviews ? `要確認 ${reviews}` : "要確認";

  if (view === "calendar") return renderCalendar(all);

  const q = searchEl.value.normalize("NFKC").trim().toLowerCase();
  const items = all.filter(FILTERS[filter]).filter((i) => !q ||
    [i.store, i.category, i.memo, i.kind].some((v) => String(v || "").normalize("NFKC").toLowerCase().includes(q)));

  if (items.length === 0) {
    bodyEl.innerHTML = `<p class="empty">${all.length ? "見つかりませんでした" : "この月の利用はありません"}</p>`;
    return;
  }

  // 日付ごとにまとめる（新しい日が上）
  const byDate = {};
  items.forEach((i) => { (byDate[i.date] ||= []).push(i); });
  bodyEl.innerHTML = Object.keys(byDate)
    .sort((a, b) => b.localeCompare(a))
    .map((date) => `
      <h3 class="day-title"><span>${formatDayWeek(date)}</span><span>${yen(sum(byDate[date]))}</span></h3>
      <div class="list">${byDate[date].map((r) => rowHtml(r)).join("")}</div>`)
    .join("");
}

function renderCalendar(all) {
  const items = all.filter((i) => i.date === selected);
  const holiday = holidayName(selected);
  bodyEl.innerHTML = `
    <div class="card cal-card">${calendarHtml(month, selected)}</div>
    <h3 class="day-title">
      <span>${formatDayWeek(selected)}${holiday ? ` ${holiday}` : ""}</span>
      <span>${items.length ? yen(sum(items)) : ""}</span>
    </h3>
    <div class="list">${items.length
      ? items.map((r) => rowHtml(r)).join("")
      : `<p class="empty">利用はありません</p>`}</div>`;
  swipe(bodyEl.querySelector(".cal-card"), (dir) => setMonth(addMonth(month, dir)));
}
