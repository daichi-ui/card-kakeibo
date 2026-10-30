// ===== 固定費の設定（ひな形の登録・編集・削除） =====
import {
  doc, addDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { state, subscribe, fixedRef } from "./store.js";
import { today, yen, formatMonth, escapeHtml } from "./utils.js";

const sheet = document.getElementById("fixedSheet");
const form = document.getElementById("fixedForm");
const list = document.getElementById("fixedList");
const el = {
  title: document.getElementById("fixedFormTitle"),
  name: document.getElementById("fixedName"),
  amount: document.getElementById("fixedAmount"),
  day: document.getElementById("fixedDay"),
  category: document.getElementById("fixedCategory"),
  start: document.getElementById("fixedStart"),
  end: document.getElementById("fixedEnd"),
  submit: document.getElementById("fixedSubmit"),
  cancel: document.getElementById("fixedCancel"),
  msg: document.getElementById("fixedMsg")
};
let editingId = null;

// 引き落とし日の選択肢（1日〜31日。31日は月末として扱う）
for (let d = 1; d <= 31; d++) {
  el.day.add(new Option(d === 31 ? "月末" : `毎月${d}日`, String(d)));
}

subscribe(render);

export function openFixedSettings(editId = null) {
  resetForm();
  if (editId) startEdit(editId);
  sheet.showModal();
}

function resetForm() {
  editingId = null;
  form.reset();
  el.title.textContent = "固定費を追加";
  el.submit.textContent = "追加する";
  el.cancel.hidden = true;
  el.day.value = "1";
  el.start.value = today().slice(0, 7);
  el.msg.textContent = "";
}

function startEdit(id) {
  const fc = state.fixedCosts.find((x) => x.id === id);
  if (!fc) return;
  editingId = id;
  el.title.textContent = "固定費を編集";
  el.submit.textContent = "更新する";
  el.cancel.hidden = false;
  el.name.value = fc.name;
  el.amount.value = fc.amount;
  el.day.value = String(fc.day || 1);
  el.category.value = fc.category && fc.category !== "未分類" ? fc.category : "";
  el.start.value = fc.startMonth || "";
  el.end.value = fc.endMonth || "";
  el.msg.textContent = "";
  sheet.scrollTo({ top: 0, behavior: "smooth" });
}

el.cancel.addEventListener("click", resetForm);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {
    name: el.name.value.trim(),
    amount: Math.round(Number(el.amount.value)),
    day: Number(el.day.value),
    category: el.category.value.trim() || "未分類",
    startMonth: el.start.value,
    endMonth: el.end.value || ""
  };
  if (data.endMonth && data.endMonth < data.startMonth) {
    return showMsg("終了月は開始月より後にしてください", true);
  }
  try {
    if (editingId) {
      await updateDoc(doc(fixedRef(), editingId), data);
    } else {
      await addDoc(fixedRef(), { ...data, createdAt: serverTimestamp() });
    }
    const wasEditing = !!editingId;
    resetForm();
    showMsg(wasEditing ? "更新しました" : "追加しました");
  } catch (err) {
    showMsg("保存に失敗しました：" + err.message, true);
  }
});

let msgTimer = null;
function showMsg(text, isError = false) {
  el.msg.textContent = text;
  el.msg.classList.toggle("error", isError);
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { el.msg.textContent = ""; }, 3000);
}

// ===== 一覧 =====
function render() {
  if (state.fixedCosts.length === 0) {
    list.innerHTML = `<p class="empty">まだ登録されていません</p>`;
    return;
  }
  const month = today().slice(0, 7);
  list.innerHTML = [...state.fixedCosts]
    .sort((a, b) => (a.day - b.day) || a.name.localeCompare(b.name))
    .map((fc) => {
      const ended = fc.endMonth && fc.endMonth < month;
      const period = `${formatMonth(fc.startMonth)}〜${fc.endMonth ? formatMonth(fc.endMonth) : ""}`;
      return `
        <div class="item ${ended ? "is-expired" : ""}">
          <div class="item-head">
            <span class="item-date">${escapeHtml(fc.name)}</span>
            <span class="item-amount">${yen(fc.amount)}</span>
          </div>
          <div class="item-sub">
            ${fc.day === 31 ? "月末" : `毎月${fc.day}日`} ・ ${escapeHtml(fc.category || "未分類")} ・ ${period}${ended ? "（終了）" : ""}
          </div>
          <div class="item-actions">
            <button type="button" class="btn-small" data-edit="${fc.id}">編集</button>
            <button type="button" class="btn-small btn-danger" data-delete="${fc.id}">削除</button>
          </div>
        </div>`;
    }).join("");
}

list.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (btn.dataset.edit) startEdit(btn.dataset.edit);
  if (btn.dataset.delete) {
    const fc = state.fixedCosts.find((x) => x.id === btn.dataset.delete);
    if (!fc) return;
    const ok = confirm(`「${fc.name}」を削除しますか？\n過去の月の分も含めて、すべての月から消えます。\n解約した場合は「編集」で終了月を入れるのがおすすめです。`);
    if (!ok) return;
    try {
      await deleteDoc(doc(fixedRef(), fc.id));
      if (editingId === fc.id) resetForm();
    } catch (err) {
      showMsg("削除に失敗しました：" + err.message, true);
    }
  }
});
