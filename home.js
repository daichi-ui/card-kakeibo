// ===== ホーム =====
// 次のお支払い・支払日・先月の利用と前月差・サブスク合計・要確認・最近の利用
import {
  state, subscribe, monthTotal, monthFixedTotal, monthItems, countable, reviewItems
} from "./store.js";
import { rowHtml, bindRows } from "./rows.js";
import { openTxNew } from "./editor.js";
import {
  today, addMonth, nextPayment, parseDate, signedYen, price, formatMonth, slashDate, holidayName
} from "./utils.js";

const payCard = document.getElementById("payCard");
const statGrid = document.getElementById("statGrid");
const reviewArea = document.getElementById("reviewArea");
const recentList = document.getElementById("recentList");

const RECENT_COUNT = 5;

subscribe(render);
bindRows(reviewArea);
bindRows(recentList);
document.getElementById("homeAddBtn").addEventListener("click", () => openTxNew());

// 明細タブ・サブスクタブでその月を開く
function openTab(tab, month) {
  window.dispatchEvent(new CustomEvent("open-month", { detail: { tab, month } }));
}

function render() {
  if (!state.user) {
    [payCard, statGrid, reviewArea, recentList].forEach((e) => { e.innerHTML = ""; });
    return;
  }

  const t = today();
  const thisMonth = t.slice(0, 7);

  // ===== 次のお支払い =====
  const pay = nextPayment(t);
  const payTotal = monthTotal(pay.usageMonth);
  const daysLeft = Math.round((parseDate(pay.date) - parseDate(t)) / 86400000);
  const stillUsing = pay.usageMonth === thisMonth; // まだ利用が増える月か
  const original = `${addMonth(pay.usageMonth, 1)}-25`;
  const shiftReason = pay.shifted
    ? `25日が${holidayName(original) || (parseDate(original).getDay() === 0 ? "日曜" : "土曜")}のため翌営業日`
    : "";

  payCard.innerHTML = `
    <button type="button" class="hero" data-tab="list" data-month="${pay.usageMonth}">
      <span class="hero-label">次のお支払い</span>
      <span class="hero-amount">${price(payTotal, "xl")}</span>
      <span class="hero-date">
        <strong>${slashDate(pay.date)}</strong>
        <span class="pill">${daysLeft === 0 ? "今日" : `あと${daysLeft}日`}</span>
      </span>
      <span class="hero-sub">${formatMonth(pay.usageMonth)}利用分${stillUsing ? "（まだ増えます）" : ""}${shiftReason ? ` ・ ${shiftReason}` : ""}</span>
    </button>`;

  // ===== 先月の利用・前月差 / サブスク合計 =====
  const lastMonth = addMonth(thisMonth, -1);
  const lastTotal = monthTotal(lastMonth);
  const prevTotal = monthTotal(addMonth(thisMonth, -2));
  const diff = lastTotal - prevTotal;
  const fixedTotal = monthFixedTotal(thisMonth);
  const fixedCount = countable(monthItems(thisMonth).filter((i) => i.type === "fixed")).length;

  statGrid.innerHTML = `
    <button type="button" class="card stat" data-tab="list" data-month="${lastMonth}">
      <span class="stat-label">先月の利用</span>
      <span class="stat-num">${price(lastTotal, "l")}</span>
      <span class="stat-sub ${diff > 0 ? "is-up" : diff < 0 ? "is-down" : ""}">前月比 ${signedYen(diff)}</span>
    </button>
    <button type="button" class="card stat" data-tab="subs" data-month="${thisMonth}">
      <span class="stat-label">サブスク・固定費</span>
      <span class="stat-num">${price(fixedTotal, "l")}</span>
      <span class="stat-sub">今月 ${fixedCount}件</span>
    </button>`;

  // ===== 要確認 =====
  const reviews = reviewItems();
  reviewArea.innerHTML = reviews.length ? `
    <h2 class="section-title is-alert">要確認（${reviews.length}件）</h2>
    <div class="list">${reviews.map((r) => rowHtml(r, { showDate: true })).join("")}</div>
    <p class="section-note">メールから金額を読み取れなかった利用です。タップして金額を入れてください。</p>` : "";

  // ===== 最近の利用（Gmail・手入力） =====
  const recent = state.transactions
    .filter((x) => !x.deleted && !x.needsReview)
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.time || "").localeCompare(a.time || ""))
    .slice(0, RECENT_COUNT);
  recentList.innerHTML = recent.length
    ? recent.map((r) => rowHtml(r, { showDate: true })).join("")
    : `<p class="empty">まだ利用がありません</p>`;
}

// カードをタップしたら、その月の明細（またはサブスク）を開く
[payCard, statGrid].forEach((el) => {
  el.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-month]");
    if (btn) openTab(btn.dataset.tab, btn.dataset.month);
  });
});
