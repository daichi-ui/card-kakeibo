// ===== 明細 =====
//   上：カレンダー（日付をタップでクイック入力）
//   下：月の合計と支払日、日付ごとの利用一覧（検索・絞り込み・スワイプで除外）
import { state, subscribe, monthItems, sum, reviewItems } from "./store.js";
import { rowHtml, bindRows } from "./rows.js";
import { createCalendar } from "./calendar.js";
import { openQuickAdd } from "./quickadd.js";
import { animateNumber } from "./motion.js";
import { today, paymentDateOf, yen, formatMonth, formatDayWeek, slashDate } from "./utils.js";

const summaryEl = document.getElementById("listSummary");
const searchArea = document.getElementById("listSearchArea");
const searchBtn = document.getElementById("listSearchBtn");
const searchEl = document.getElementById("listSearch");
const filterEl = document.getElementById("listFilter");
const bodyEl = document.getElementById("listBody");

let filter = "all";

const FILTERS = {
  all: () => true,
  review: (i) => i.needsReview,
  fixed: (i) => i.type === "fixed",
  manual: (i) => i.source === "manual",
  excluded: (i) => i.excluded
};

const calendar = createCalendar(document.getElementById("listCalendar"), {
  onPick: (date) => openQuickAdd(date),
  onMonth: () => render(true)
});

subscribe(() => { calendar.refresh(); render(); });
bindRows(bodyEl);

searchBtn.addEventListener("click", () => {
  const open = searchArea.hidden;
  searchArea.hidden = !open;
  searchBtn.classList.toggle("is-active", open);
  searchBtn.setAttribute("aria-expanded", String(open));
  if (open) {
    searchEl.focus();
  } else {
    searchEl.value = "";
    setFilter("all");
  }
  render(true);
});
searchEl.addEventListener("input", () => render());

function setFilter(name) {
  filter = name;
  filterEl.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("is-active", b.dataset.filter === filter));
}
filterEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter]");
  if (!btn) return;
  setFilter(btn.dataset.filter);
  render(true);
});

// ホームから、指定の月（と絞り込み）を開く
window.addEventListener("open-month", (e) => {
  if (e.detail.tab !== "list") return;
  if (e.detail.filter) {
    searchArea.hidden = false;
    searchBtn.classList.add("is-active");
    setFilter(e.detail.filter);
  }
  if (e.detail.month) calendar.setMonth(e.detail.month);
  render(true);
});

// ＋ボタンで追加するときの日付（表示中の月が今月なら今日、ほかは1日）
export function addDate() {
  return today().startsWith(calendar.month) ? today() : `${calendar.month}-01`;
}

let lastTotal = 0;

// animate：月や絞り込みを変えたときは、一覧を下から順に出す
function render(animate = false) {
  if (!state.user) {
    summaryEl.innerHTML = bodyEl.innerHTML = "";
    return;
  }
  const month = calendar.month;
  const all = monthItems(month);
  const total = sum(all);

  summaryEl.innerHTML = `
    <span class="month-sum-label">${formatMonth(month)}の合計</span>
    <span class="price price-xl"><span class="price-num" data-count></span><span class="price-yen">円</span></span>
    <span class="month-sum-meta">${slashDate(paymentDateOf(month))} 支払い ・ ${all.filter((i) => !i.excluded).length}件</span>`;
  animateNumber(summaryEl.querySelector("[data-count]"), lastTotal, total);
  lastTotal = total;

  // 要確認の数を絞り込みボタンに出す
  const reviews = reviewItems().filter((r) => r.date?.startsWith(month)).length;
  filterEl.querySelector('[data-filter="review"]').textContent = reviews ? `要確認 ${reviews}` : "要確認";

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
    .map((date, n) => `
      <section class="day-group ${animate ? "stagger" : ""}" style="--n:${Math.min(n, 8)}">
        <h3 class="day-title"><span>${formatDayWeek(date)}</span><span>${yen(sum(byDate[date]))}</span></h3>
        <div class="list">${byDate[date].map((r) => rowHtml(r)).join("")}</div>
      </section>`)
    .join("");
}
