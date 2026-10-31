// ===== ホーム =====
// 次のお支払い・先月の利用と前月差・サブスク合計・要確認のお知らせ
import { state, subscribe, monthTotal, monthFixedTotal, reviewItems } from "./store.js";
import {
  today, addMonth, nextPayment, parseDate, signedYen, price, formatMonth, slashDate
} from "./utils.js";

const payCard = document.getElementById("payCard");
const statGrid = document.getElementById("statGrid");
const reviewArea = document.getElementById("reviewArea");

subscribe(render);

function render() {
  if (!state.user) {
    [payCard, statGrid, reviewArea].forEach((e) => { e.innerHTML = ""; });
    return;
  }

  const t = today();
  const thisMonth = t.slice(0, 7);

  // ===== 要確認（あるときだけ、いちばん上にお知らせ） =====
  const reviews = reviewItems();
  reviewArea.innerHTML = reviews.length ? `
    <button type="button" class="notice" data-tab="list" data-month="${reviews.at(0).date.slice(0, 7)}" data-filter="review">
      <span class="notice-dot"></span>
      <span class="notice-text">金額を確認してほしい利用が${reviews.length}件あります</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
    </button>` : "";

  // ===== 次のお支払い =====
  const pay = nextPayment(t);
  const daysLeft = Math.round((parseDate(pay.date) - parseDate(t)) / 86400000);
  payCard.innerHTML = `
    <button type="button" class="hero" data-tab="list" data-month="${pay.usageMonth}">
      <span class="hero-label">次のお支払い</span>
      <span class="hero-amount">${price(monthTotal(pay.usageMonth), "xl")}</span>
      <span class="hero-date">
        <strong>${slashDate(pay.date)}</strong>
        <span class="pill">${daysLeft === 0 ? "今日" : `あと${daysLeft}日`}</span>
      </span>
      <span class="hero-sub">${formatMonth(pay.usageMonth)}利用分</span>
    </button>`;

  // ===== 先月の利用・前月差 / サブスク合計 =====
  const lastMonth = addMonth(thisMonth, -1);
  const lastTotal = monthTotal(lastMonth);
  const diff = lastTotal - monthTotal(addMonth(thisMonth, -2));
  statGrid.innerHTML = `
    <button type="button" class="card stat" data-tab="list" data-month="${lastMonth}">
      <span class="stat-label">先月の利用</span>
      <span class="stat-num">${price(lastTotal, "l")}</span>
      <span class="stat-sub ${diff > 0 ? "is-up" : diff < 0 ? "is-down" : ""}">前月比 ${signedYen(diff)}</span>
    </button>
    <button type="button" class="card stat" data-tab="settings">
      <span class="stat-label">サブスク</span>
      <span class="stat-num">${price(monthFixedTotal(thisMonth), "l")}</span>
      <span class="stat-sub">毎月の固定費</span>
    </button>`;
}

// カードをタップしたら、その画面を開く
[payCard, statGrid, reviewArea].forEach((el) => {
  el.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;
    window.dispatchEvent(new CustomEvent("open-month", {
      detail: { tab: btn.dataset.tab, month: btn.dataset.month, filter: btn.dataset.filter }
    }));
  });
});
