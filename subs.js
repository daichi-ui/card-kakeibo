// ===== サブスク =====
//   上：表示中の月に反映されるサブスク（タップで今月だけ金額変更、丸ボタンで計算から除外）
//   下：登録中のサブスク（ひな形）の追加・編集・削除
// 登録したサブスクは、開始月〜終了月のすべての月の明細に自動で入る
import {
  doc, addDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { state, subscribe, fixedRef, monthItems, sum, isActiveIn, rememberCategory } from "./store.js";
import { rowHtml, bindRows } from "./rows.js";
import { attachCategoryInput } from "./editor.js";
import { today, addMonth, price, formatMonth, escapeHtml, normalizeCategory } from "./utils.js";

const monthEl = document.getElementById("subsMonth");
const summaryEl = document.getElementById("subsSummary");
const monthListEl = document.getElementById("subsMonthList");
const allListEl = document.getElementById("subsAllList");

let month = today().slice(0, 7);

subscribe(render);
bindRows(monthListEl);

document.getElementById("subsPrev").addEventListener("click", () => { month = addMonth(month, -1); render(); });
document.getElementById("subsNext").addEventListener("click", () => { month = addMonth(month, 1); render(); });
document.getElementById("subsAddBtn").addEventListener("click", () => openSubSheet());
window.addEventListener("edit-subscription", (e) => openSubSheet(e.detail));
window.addEventListener("open-month", (e) => {
  if (e.detail.tab !== "subs") return;
  month = e.detail.month;
  render();
});

function render() {
  monthEl.textContent = formatMonth(month);
  if (!state.user) {
    summaryEl.innerHTML = monthListEl.innerHTML = allListEl.innerHTML = "";
    return;
  }

  const items = monthItems(month).filter((i) => i.type === "fixed")
    .sort((a, b) => a.date.localeCompare(b.date));
  const excluded = items.filter((i) => i.excluded).length;

  summaryEl.innerHTML = `
    <span class="summary-label">${formatMonth(month)}のサブスク合計</span>
    <span class="summary-amount">${price(sum(items), "xl")}</span>
    <span class="summary-meta">${items.length}件${excluded ? ` ・ ${excluded}件を計算から除外` : ""}</span>`;

  monthListEl.innerHTML = items.length
    ? items.map((i) => rowHtml(i, { showDate: true, toggle: true })).join("")
    : `<p class="empty">この月のサブスクはありません</p>`;

  const t = today().slice(0, 7);
  allListEl.innerHTML = state.fixedCosts.length
    ? [...state.fixedCosts]
      .sort((a, b) => (a.day - b.day) || a.name.localeCompare(b.name))
      .map((fc) => {
        const ended = fc.endMonth && fc.endMonth < t;
        const period = `${fc.startMonth ? formatMonth(fc.startMonth) : ""}〜${fc.endMonth ? formatMonth(fc.endMonth) : ""}`;
        return `
          <div class="row ${ended || !isActiveIn(fc, t) ? "is-dim" : ""}">
            <button type="button" class="row-main" data-edit="${escapeHtml(fc.id)}">
              <span class="row-head">
                <span class="row-title">${escapeHtml(fc.name)}</span>
                <span class="row-amount">${price(fc.amount, "m")}</span>
              </span>
              <span class="row-sub"><span>${fc.day === 31 ? "月末" : `毎月${fc.day}日`} ・ ${escapeHtml(fc.category || "未分類")} ・ ${period}${ended ? "（終了）" : ""}</span></span>
            </button>
          </div>`;
      }).join("")
    : `<p class="empty">まだ登録されていません</p>`;
}

allListEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-edit]");
  if (btn) openSubSheet(btn.dataset.edit);
});

// ===== 追加・編集の画面 =====
const sheet = document.getElementById("subSheet");
const form = document.getElementById("subForm");
const el = {
  title: document.getElementById("subTitle"),
  name: document.getElementById("subName"),
  amount: document.getElementById("subAmount"),
  day: document.getElementById("subDay"),
  category: document.getElementById("subCategory"),
  start: document.getElementById("subStart"),
  end: document.getElementById("subEnd"),
  del: document.getElementById("subDelete"),
  msg: document.getElementById("subMsg")
};
const renderChips = attachCategoryInput(el.category, document.getElementById("subCategoryChips"));
let editingId = null;

// 引き落とし日の選択肢（1日〜31日。31日は月末として扱う）
for (let d = 1; d <= 31; d++) {
  el.day.add(new Option(d === 31 ? "月末" : `毎月${d}日`, String(d)));
}

function openSubSheet(id = null) {
  form.reset();
  el.msg.textContent = "";
  const fc = id && state.fixedCosts.find((x) => x.id === id);
  editingId = fc ? fc.id : null;
  el.title.textContent = fc ? "サブスクを編集" : "サブスクを追加";
  el.del.hidden = !fc;
  el.name.value = fc?.name || "";
  el.amount.value = fc?.amount ?? "";
  el.day.value = String(fc?.day || 1);
  el.category.value = fc?.category && fc.category !== "未分類" ? fc.category : "";
  el.start.value = fc ? fc.startMonth || "" : today().slice(0, 7);
  el.end.value = fc?.endMonth || "";
  renderChips();
  sheet.showModal();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {
    name: el.name.value.trim(),
    amount: Math.round(Number(el.amount.value)),
    day: Number(el.day.value),
    category: normalizeCategory(el.category.value),
    startMonth: el.start.value,
    endMonth: el.end.value || ""
  };
  if (data.endMonth && data.endMonth < data.startMonth) {
    el.msg.textContent = "終了月は開始月より後にしてください";
    el.msg.classList.add("error");
    return;
  }
  try {
    if (editingId) await updateDoc(doc(fixedRef(), editingId), data);
    else await addDoc(fixedRef(), { ...data, createdAt: serverTimestamp() });
    rememberCategory(data.category);
    sheet.close();
  } catch (err) {
    el.msg.textContent = "保存に失敗しました：" + err.message;
    el.msg.classList.add("error");
  }
});

el.del.addEventListener("click", async () => {
  const fc = state.fixedCosts.find((x) => x.id === editingId);
  if (!fc) return;
  const ok = confirm(`「${fc.name}」を削除しますか？\n過去の月の分も含めて、すべての月から消えます。\n解約した場合は終了月を入れるのがおすすめです。`);
  if (!ok) return;
  try {
    await deleteDoc(doc(fixedRef(), fc.id));
    sheet.close();
  } catch (err) {
    el.msg.textContent = "削除に失敗しました：" + err.message;
    el.msg.classList.add("error");
  }
});
