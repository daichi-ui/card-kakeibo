// ===== ホーム =====
// 次の支払い額・今月の利用額・要確認・最近の利用
import { state, subscribe, monthItems, monthTotal, countable, reviewItems } from "./store.js";
import { rowHtml, bindRows } from "./rows.js";
import { openTxNew } from "./editor.js";
import {
  today, addMonth, nextPayment, paymentDateOf, parseDate, yen, price, formatMonth, slashDate
} from "./utils.js";

const payCard = document.getElementById("payCard");
const monthCard = document.getElementById("monthCard");
const reviewArea = document.getElementById("reviewArea");
const recentList = document.getElementById("recentList");

const RECENT_COUNT = 5;

subscribe(render);
bindRows(reviewArea);
bindRows(recentList);
document.getElementById("homeAddBtn").addEventListener("click", () => openTxNew());

// 明細タブでその月を開く
function openMonth(month) {
  window.dispatchEvent(new CustomEvent("open-month", { detail: month }));
}

function render() {
  if (!state.user) {
    [payCard, monthCard, reviewArea, recentList].forEach((e) => { e.innerHTML = ""; });
    return;
  }

  const t = today();
  const thisMonth = t.slice(0, 7);

  // ===== 次の支払い =====
  const pay = nextPayment(t);
  const payTotal = monthTotal(pay.usageMonth);
  const daysLeft = Math.round((parseDate(pay.date) - parseDate(t)) / 86400000);
  const stillUsing = pay.usageMonth === thisMonth; // まだ利用が増える月か

  payCard.innerHTML = `
    <button type="button" class="pay-inner" data-month="${pay.usageMonth}">
      <div class="pay-label">次の支払い</div>
      <div class="pay-amount">${price(payTotal, "xl")}</div>
      <div class="pay-sub">
        <span>${slashDate(pay.date)}（${daysLeft === 0 ? "今日" : `あと${daysLeft}日`}）</span>
        <span>${formatMonth(pay.usageMonth)}利用分${stillUsing ? "・まだ増えます" : ""}</span>
      </div>
    </button>`;

  // ===== 今月・先月の利用 =====
  const thisItems = countable(monthItems(thisMonth));
  const thisTotal = thisItems.reduce((s, i) => s + Number(i.amount), 0);
  const lastMonth = addMonth(thisMonth, -1);
  const lastTotal = monthTotal(lastMonth);
  const diff = thisTotal - lastTotal;

  monthCard.innerHTML = `
    <button type="button" class="stat" data-month="${thisMonth}">
      <span class="stat-label">今月の利用</span>
      <span class="stat-num">${price(thisTotal, "l")}</span>
      <span class="stat-sub">${thisItems.length}件 ・ ${slashDate(paymentDateOf(thisMonth))}払い</span>
    </button>
    <button type="button" class="stat" data-month="${lastMonth}">
      <span class="stat-label">先月の利用</span>
      <span class="stat-num">${price(lastTotal, "l")}</span>
      <span class="stat-sub">今月は${diff >= 0 ? `${yen(diff)} 多い` : `${yen(-diff)} 少ない`}</span>
    </button>`;

  // ===== 要確認 =====
  const reviews = reviewItems();
  reviewArea.innerHTML = reviews.length ? `
    <h2 class="group-title group-title-alert">要確認（${reviews.length}件）</h2>
    <div class="list">${reviews.map((r) => rowHtml(r, { showDate: true })).join("")}</div>
    <p class="group-note">メールから金額を読み取れなかった利用です。タップして金額を入れてください。</p>` : "";

  // ===== 最近の利用（メール・手入力） =====
  const recent = state.transactions
    .filter((x) => !x.deleted && !x.needsReview)
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.time || "").localeCompare(a.time || ""))
    .slice(0, RECENT_COUNT);
  recentList.innerHTML = recent.length
    ? recent.map((r) => rowHtml(r, { showDate: true })).join("")
    : `<p class="empty">まだ利用がありません</p>`;
}

// カードをタップしたら、その月の明細を開く
[payCard, monthCard].forEach((el) => {
  el.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-month]");
    if (btn) openMonth(btn.dataset.month);
  });
});
