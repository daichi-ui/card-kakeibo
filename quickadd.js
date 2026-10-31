// ===== クイック入力（カレンダーの日付・＋ボタンから下から出る） =====
//   テンキーで金額を入れ、カテゴリをタップして「追加」
//   「詳細」でいつもの入力画面（お店・時刻・メモ）へ
import { addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { state, subscribe, txRef, dayItems, sum, categoryNames, categoryColor } from "./store.js";
import { openTxNew } from "./editor.js";
import { ensureCategory } from "./categories.js";
import { today, formatDayWeek, holidayName, yen, escapeHtml, normalizeCategory } from "./utils.js";
import { toast } from "./toast.js";

const sheet = document.getElementById("quickSheet");
const dateEl = document.getElementById("qDate");
const dayEl = document.getElementById("qDay");
const amountEl = document.getElementById("qAmount");
const catsEl = document.getElementById("qCats");
const storeEl = document.getElementById("qStore");
const saveEl = document.getElementById("qSave");
const keypad = document.getElementById("qKeypad");

const LAST_CAT = "card-kakeibo.lastCategory";
const MAX_DIGITS = 8;
let date = today();
let digits = "";
let category = "未分類";

function lastCategory() {
  try { return localStorage.getItem(LAST_CAT) || "未分類"; } catch { return "未分類"; }
}

export function openQuickAdd(d = today()) {
  date = d;
  digits = "";
  storeEl.value = "";
  category = categoryNames().includes(lastCategory()) ? lastCategory() : "未分類";
  const holiday = holidayName(date);
  dateEl.textContent = formatDayWeek(date) + (holiday ? ` ${holiday}` : "");
  renderDay();
  renderAmount();
  renderCats();
  sheet.showModal();
  // 選んでいるカテゴリが見えるところまで横に送る
  requestAnimationFrame(() => catsEl.querySelector(".is-selected")?.scrollIntoView({ inline: "center", block: "nearest" }));
}

function renderDay() {
  const items = dayItems(date).filter((i) => !i.excluded);
  dayEl.textContent = items.length ? `この日 ${yen(sum(items))} ・ ${items.length}件` : "この日の利用はまだありません";
}
subscribe(() => sheet.open && renderDay());

function renderAmount(bump = false) {
  const v = Number(digits || 0);
  amountEl.textContent = v.toLocaleString("ja-JP");
  amountEl.parentElement.classList.toggle("is-empty", !digits);
  saveEl.disabled = !digits || v === 0;
  if (bump) {
    amountEl.classList.remove("bump");
    void amountEl.offsetWidth;
    amountEl.classList.add("bump");
  }
}

function renderCats() {
  const names = ["未分類", ...categoryNames()];
  catsEl.innerHTML = names.map((n) => `
    <button type="button" class="q-cat ${n === category ? "is-selected" : ""}" data-cat="${escapeHtml(n)}" style="--c:${categoryColor(n)}">
      <span class="dot"></span>${escapeHtml(n)}
    </button>`).join("");
}

catsEl.addEventListener("click", (e) => {
  const b = e.target.closest("[data-cat]");
  if (!b) return;
  category = b.dataset.cat;
  catsEl.querySelectorAll("[data-cat]").forEach((x) => x.classList.toggle("is-selected", x === b));
});

function press(key) {
  if (key === "back") digits = digits.slice(0, -1);
  else if (key === "clear") digits = "";
  else if (digits.length < MAX_DIGITS) digits = (digits + key).replace(/^0+/, "");
  renderAmount(true);
}

keypad.addEventListener("click", (e) => {
  const k = e.target.closest("[data-key]");
  if (k) press(k.dataset.key);
});
// 長押しで全部消す
let holdTimer = null;
keypad.addEventListener("pointerdown", (e) => {
  if (!e.target.closest('[data-key="back"]')) return;
  holdTimer = setTimeout(() => press("clear"), 500);
});
["pointerup", "pointerleave", "pointercancel"].forEach((t) => keypad.addEventListener(t, () => clearTimeout(holdTimer)));

// パソコンでは数字キーでも入力できる
sheet.addEventListener("keydown", (e) => {
  if (e.target === storeEl) return;
  if (/^\d$/.test(e.key)) { press(e.key); e.preventDefault(); }
  else if (e.key === "Backspace") { press("back"); e.preventDefault(); }
  else if (e.key === "Enter" && !saveEl.disabled) { save(); e.preventDefault(); }
});

document.getElementById("qDetail").addEventListener("click", () => {
  const amount = digits ? Number(digits) : null;
  sheet.close();
  openTxNew(date, { amount, category, store: storeEl.value });
});

async function save() {
  const amount = Number(digits);
  if (!amount) return;
  saveEl.disabled = true;
  const c = normalizeCategory(category);
  try {
    await addDoc(txRef(), {
      date,
      time: "",
      store: storeEl.value.trim() || (c === "未分類" ? "手入力" : c),
      amount,
      category: c,
      memo: "",
      needsReview: false,
      excluded: false,
      source: "manual",
      createdAt: serverTimestamp()
    });
    ensureCategory(c);
    try { localStorage.setItem(LAST_CAT, c); } catch { /* 保存できなくても続ける */ }
    sheet.close();
    toast(`${formatDayWeek(date)}に ${yen(amount)} を追加しました`);
  } catch (err) {
    toast("保存に失敗しました：" + err.message, true);
    saveEl.disabled = false;
  }
}
saveEl.addEventListener("click", save);
