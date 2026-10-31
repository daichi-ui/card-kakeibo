// ===== 明細（月ごとの利用一覧） =====
//   上：その月の合計と支払日（25日・休業日は翌営業日）
//   検索・絞り込み・計算からの除外の切り替え
import { state, subscribe, monthItems, sum } from "./store.js";
import { rowHtml, bindRows } from "./rows.js";
import { openTxNew } from "./editor.js";
import {
  today, addMonth, paymentDateOf, yen, price, formatMonth, formatDayWeek, slashDate, swipe
} from "./utils.js";

const titleEl = document.getElementById("listMonth");
const summaryEl = document.getElementById("listSummary");
const bodyEl = document.getElementById("listBody");
const searchEl = document.getElementById("listSearch");
const filterEl = document.getElementById("listFilter");

let month = today().slice(0, 7);
let filter = "all";

// 絞り込みの種類
const FILTERS = {
  all: () => true,
  mail: (i) => i.source === "mail",
  manual: (i) => i.source === "manual",
  fixed: (i) => i.type === "fixed",
  review: (i) => i.needsReview,
  excluded: (i) => i.excluded
};

subscribe(render);
bindRows(bodyEl);

document.getElementById("listPrev").addEventListener("click", () => { month = addMonth(month, -1); render(); });
document.getElementById("listNext").addEventListener("click", () => { month = addMonth(month, 1); render(); });
swipe(summaryEl, (dir) => { month = addMonth(month, dir); render(); });
document.getElementById("listAddBtn").addEventListener("click", () => {
  // 今月なら今日、ほかの月ならその月の1日を初期値にする
  const t = today();
  openTxNew(t.startsWith(month) ? t : `${month}-01`);
});
searchEl.addEventListener("input", render);
filterEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter]");
  if (!btn) return;
  filter = btn.dataset.filter;
  filterEl.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("is-active", b === btn));
  render();
});

// ホームなどから、指定の月を開く
window.addEventListener("open-month", (e) => {
  if (e.detail.tab !== "list") return;
  month = e.detail.month;
  render();
});

function render() {
  titleEl.textContent = formatMonth(month);
  if (!state.user) {
    summaryEl.innerHTML = bodyEl.innerHTML = "";
    return;
  }

  const all = monthItems(month);
  const fixedTotal = sum(all.filter((i) => i.type === "fixed"));
  const pay = paymentDateOf(month);

  summaryEl.innerHTML = `
    <span class="summary-label">合計</span>
    <span class="summary-amount">${price(sum(all), "xl")}</span>
    <span class="summary-meta">
      <span>支払日 <strong>${slashDate(pay)}</strong></span>
      <span>${all.filter((i) => !i.excluded).length}件${fixedTotal ? ` ・ うちサブスク ${yen(fixedTotal)}` : ""}</span>
    </span>`;

  // 検索（お店・カテゴリ・メモ・種類）と絞り込み
  const q = searchEl.value.normalize("NFKC").trim().toLowerCase();
  const items = all.filter(FILTERS[filter]).filter((i) => !q ||
    [i.store, i.category, i.memo, i.kind].some((v) => String(v || "").normalize("NFKC").toLowerCase().includes(q)));

  if (items.length === 0) {
    bodyEl.innerHTML = `<div class="list"><p class="empty">${
      all.length ? "条件に合う利用はありません" : "この月の利用はありません"}</p></div>`;
    return;
  }

  // 日付ごとにまとめる（新しい日が上）
  const byDate = {};
  items.forEach((i) => { (byDate[i.date] ||= []).push(i); });

  bodyEl.innerHTML = Object.keys(byDate)
    .sort((a, b) => b.localeCompare(a))
    .map((date) => `
      <h3 class="section-title day-title">
        <span>${formatDayWeek(date)}</span><span>${yen(sum(byDate[date]))}</span>
      </h3>
      <div class="list">${byDate[date].map((r) => rowHtml(r, { toggle: true })).join("")}</div>`)
    .join("");
}
