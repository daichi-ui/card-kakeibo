// ===== 明細（月ごとの利用一覧） =====
import { state, subscribe, monthItems, countable } from "./store.js";
import { rowHtml, bindRows } from "./rows.js";
import { openTxNew } from "./editor.js";
import { today, addMonth, paymentDateOf, yen, formatMonth, formatDayWeek, slashDate } from "./utils.js";

const titleEl = document.getElementById("listMonth");
const summaryEl = document.getElementById("listSummary");
const bodyEl = document.getElementById("listBody");

let month = today().slice(0, 7);

subscribe(render);
bindRows(bodyEl);

document.getElementById("listPrev").addEventListener("click", () => { month = addMonth(month, -1); render(); });
document.getElementById("listNext").addEventListener("click", () => { month = addMonth(month, 1); render(); });
document.getElementById("listAddBtn").addEventListener("click", () => {
  // 今月なら今日、ほかの月ならその月の1日を初期値にする
  const t = today();
  openTxNew(t.startsWith(month) ? t : `${month}-01`);
});

// ホームのカードから、指定の月を開く
window.addEventListener("open-month", (e) => {
  month = e.detail;
  render();
  document.querySelector('.tab[data-tab="list"]').click();
});

function render() {
  titleEl.textContent = formatMonth(month);
  if (!state.user) {
    summaryEl.innerHTML = "";
    bodyEl.innerHTML = "";
    return;
  }

  const items = monthItems(month);
  const counted = countable(items);
  const total = counted.reduce((s, i) => s + Number(i.amount), 0);
  const fixedTotal = counted.filter((i) => i.type === "fixed").reduce((s, i) => s + Number(i.amount), 0);

  summaryEl.innerHTML = `
    <div class="month-total">${yen(total)}</div>
    <div class="month-meta">
      <span>${slashDate(paymentDateOf(month))} 支払い</span>
      <span>${counted.length}件${fixedTotal ? ` ・ うち固定費 ${yen(fixedTotal)}` : ""}</span>
    </div>`;

  if (items.length === 0) {
    bodyEl.innerHTML = `<div class="list"><p class="empty">この月の利用はありません</p></div>`;
    return;
  }

  // 日付ごとにまとめる（新しい日が上）
  const byDate = {};
  items.forEach((i) => { (byDate[i.date] ||= []).push(i); });

  bodyEl.innerHTML = Object.keys(byDate)
    .sort((a, b) => b.localeCompare(a))
    .map((date) => {
      const rows = byDate[date];
      const dayTotal = countable(rows).reduce((s, i) => s + Number(i.amount), 0);
      return `
        <h3 class="group-title day-title">
          <span>${formatDayWeek(date)}</span><span>${yen(dayTotal)}</span>
        </h3>
        <div class="list">${rows.map((r) => rowHtml(r)).join("")}</div>`;
    })
    .join("");
}
