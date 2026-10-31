// ===== カレンダー =====
//   1か月のカレンダー（日ごとの支出合計）→ 日付をタップでその日の明細とクイック入力
//   下に月の合計と、その月の利用履歴
import { addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { state, subscribe, txRef, monthItems, dayItems, sum } from "./store.js";
import { rowHtml, bindRows } from "./rows.js";
import { attachCategoryInput, ensureCategory } from "./categories.js";
import {
  today, addMonth, daysInMonth, parseDate, price, formatMonth, formatDayWeek, holidayName,
  normalizeCategory, WEEK, swipe
} from "./utils.js";

const titleEl = document.getElementById("calMonth");
const todayBtn = document.getElementById("calToday");
const gridEl = document.getElementById("calGrid");
const summaryEl = document.getElementById("calSummary");
const historyEl = document.getElementById("calHistory");

let month = today().slice(0, 7);

subscribe(render);
bindRows(historyEl);

document.getElementById("calPrev").addEventListener("click", () => { month = addMonth(month, -1); render(); });
document.getElementById("calNext").addEventListener("click", () => { month = addMonth(month, 1); render(); });
todayBtn.addEventListener("click", () => { month = today().slice(0, 7); render(); });
swipe(gridEl, (dir) => { month = addMonth(month, dir); render(); });

gridEl.addEventListener("click", (e) => {
  const cell = e.target.closest("[data-date]");
  if (cell) openDay(cell.dataset.date);
});

// セルの金額は省略せずに表示する（桁が多いときは文字を小さくする）
function cellYen(v) {
  const text = v.toLocaleString("ja-JP");
  return `<span class="${text.length >= 7 ? "is-long" : ""}">${text}</span>`;
}

function render() {
  titleEl.textContent = formatMonth(month);
  const t = today();
  todayBtn.hidden = month === t.slice(0, 7);
  if (!state.user) {
    gridEl.innerHTML = summaryEl.innerHTML = historyEl.innerHTML = "";
    return;
  }

  const items = monthItems(month);
  const byDay = new Map();
  items.forEach((i) => {
    if (i.excluded || !Number.isFinite(Number(i.amount)) || i.amount === null) return;
    byDay.set(i.date, (byDay.get(i.date) || 0) + Number(i.amount));
  });

  // ===== カレンダー =====
  const first = parseDate(`${month}-01`).getDay();
  const days = daysInMonth(month);
  const cells = [];
  WEEK.forEach((w, i) => cells.push(`<span class="cal-week ${i === 0 ? "is-sun" : i === 6 ? "is-sat" : ""}">${w}</span>`));
  for (let i = 0; i < first; i++) cells.push(`<span class="cal-blank"></span>`);
  for (let d = 1; d <= days; d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    const w = (first + d - 1) % 7;
    const holiday = holidayName(date);
    const total = byDay.get(date);
    const cls = [
      "cal-day",
      w === 0 || holiday ? "is-sun" : w === 6 ? "is-sat" : "",
      date === t ? "is-today" : "",
      total ? "has-spend" : ""
    ].filter(Boolean).join(" ");
    cells.push(`
      <button type="button" class="${cls}" data-date="${date}"
              aria-label="${formatDayWeek(date)}${holiday ? ` ${holiday}` : ""} ${total ? `${total}円` : "利用なし"}">
        <span class="cal-num">${d}</span>
        <span class="cal-amount">${total ? cellYen(total) : ""}</span>
      </button>`);
  }
  gridEl.innerHTML = cells.join("");

  // ===== 月の合計 =====
  const counted = items.filter((i) => !i.excluded);
  summaryEl.innerHTML = `
    <span class="summary-label">合計</span>
    <span class="summary-amount">${price(sum(items), "xl")}</span>
    <span class="summary-meta">${counted.length}件</span>`;

  // ===== 利用履歴（新しい順） =====
  historyEl.innerHTML = items.length
    ? items.map((i) => rowHtml(i, { showDate: true })).join("")
    : `<p class="empty">この月の利用はありません</p>`;
}

// ===== 日付をタップしたときの画面（その日の明細とクイック入力） =====
const daySheet = document.getElementById("daySheet");
const dayForm = document.getElementById("dayForm");
const dayTitle = document.getElementById("dayTitle");
const dayTotalEl = document.getElementById("dayTotal");
const dayListEl = document.getElementById("dayList");
const dayAmount = document.getElementById("dayAmount");
const dayStore = document.getElementById("dayStore");
const dayCategory = document.getElementById("dayCategory");
const dayMsg = document.getElementById("dayMsg");
const closeDayCategory = attachCategoryInput(dayCategory);
let dayDate = null;

bindRows(dayListEl);
// 編集画面を開いたら、この画面は閉じる
dayListEl.addEventListener("click", (e) => {
  if (e.target.closest("[data-action]")) daySheet.close();
});

function renderDay() {
  if (!dayDate || !daySheet.open) return;
  const items = dayItems(dayDate);
  const holiday = holidayName(dayDate);
  dayTitle.textContent = formatDayWeek(dayDate) + (holiday ? ` ${holiday}` : "");
  dayTotalEl.innerHTML = `この日の合計 ${price(sum(items), "m")}`;
  dayListEl.innerHTML = items.length
    ? items.map((i) => rowHtml(i)).join("")
    : `<p class="empty">この日の利用はありません</p>`;
}
subscribe(renderDay);

function openDay(date) {
  dayDate = date;
  dayForm.reset();
  dayMsg.textContent = "";
  daySheet.showModal();
  renderDay();
  closeDayCategory();
}

dayForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const amount = Number(dayAmount.value);
  if (dayAmount.value === "" || !Number.isFinite(amount)) {
    dayMsg.textContent = "金額を入力してください";
    dayMsg.classList.add("error");
    return;
  }
  const category = normalizeCategory(dayCategory.value);
  try {
    await addDoc(txRef(), {
      date: dayDate,
      time: "",
      store: dayStore.value.trim() || "手入力",
      amount: Math.round(amount),
      category,
      memo: "",
      needsReview: false,
      excluded: false,
      source: "manual",
      createdAt: serverTimestamp()
    });
    ensureCategory(category);
    dayForm.reset();
    dayMsg.classList.remove("error");
    dayMsg.textContent = "追加しました";
    closeDayCategory();
  } catch (err) {
    dayMsg.textContent = "保存に失敗しました：" + err.message;
    dayMsg.classList.add("error");
  }
});
