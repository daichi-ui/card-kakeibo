// ===== ホーム =====
// 要確認のお知らせ・次のお支払い・カレンダー（日付をタップで入力）・先月の利用とサブスク
import { state, subscribe, monthTotal, monthFixedTotal, reviewItems } from "./store.js";
import { createCalendar } from "./calendar.js";
import { openQuickAdd } from "./quickadd.js";
import { animateNumber } from "./motion.js";
import { today, addMonth, nextPayment, parseDate, signedYen, price, formatMonth, slashDate } from "./utils.js";

const payCard = document.getElementById("payCard");
const statGrid = document.getElementById("statGrid");
const reviewArea = document.getElementById("reviewArea");

const calendar = createCalendar(document.getElementById("homeCalendar"), {
  onPick: (date) => openQuickAdd(date)
});

let lastPay = 0;
subscribe(render);

function render() {
  if (!state.user) {
    [payCard, statGrid, reviewArea].forEach((e) => { e.innerHTML = ""; });
    lastPay = 0;
    return;
  }
  calendar.refresh();

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
  const payTotal = monthTotal(pay.usageMonth);
  const daysLeft = Math.round((parseDate(pay.date) - parseDate(t)) / 86400000);
  // カードは1回だけ作り、あとは中身だけ書き換える（出てくる動きを毎回くり返さない）
  if (!payCard.firstElementChild) {
    payCard.innerHTML = `
      <button type="button" class="hero" data-tab="list">
        <span class="hero-glow" aria-hidden="true"></span>
        <span class="hero-label">次のお支払い</span>
        <span class="hero-amount"><span class="price price-xl"><span class="price-num" data-count>0</span><span class="price-yen">円</span></span></span>
        <span class="hero-date"><strong data-date></strong><span class="pill" data-left></span></span>
        <span class="hero-sub" data-sub></span>
      </button>`;
  }
  const hero = payCard.firstElementChild;
  hero.dataset.month = pay.usageMonth;
  hero.querySelector("[data-date]").textContent = slashDate(pay.date);
  hero.querySelector("[data-left]").textContent = daysLeft === 0 ? "今日" : `あと${daysLeft}日`;
  hero.querySelector("[data-sub]").textContent = `${formatMonth(pay.usageMonth)}利用分`;
  animateNumber(payCard.querySelector("[data-count]"), lastPay, payTotal, 900);
  lastPay = payTotal;

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

// カードを指でなぞると、少し傾いて見える
payCard.addEventListener("pointermove", (e) => {
  const hero = payCard.firstElementChild;
  if (!hero || e.pointerType === "touch" && e.pressure === 0) return;
  const r = hero.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  hero.style.setProperty("--ry", `${(x * 10).toFixed(2)}deg`);
  hero.style.setProperty("--rx", `${(-y * 10).toFixed(2)}deg`);
});
payCard.addEventListener("pointerleave", () => {
  const hero = payCard.firstElementChild;
  hero?.style.setProperty("--rx", "0deg");
  hero?.style.setProperty("--ry", "0deg");
});
