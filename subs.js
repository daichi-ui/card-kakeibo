// ===== サブスクの追加・編集（設定タブから開く） =====
// 登録したサブスクは、開始月〜終了月のすべての月の明細に自動で入る
import {
  doc, addDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { state, fixedRef } from "./store.js";
import { attachCategoryInput, ensureCategory } from "./categories.js";
import { today, normalizeCategory } from "./utils.js";
import { resizeImage, pickerHtml } from "./images.js";

window.addEventListener("edit-subscription", (e) => openSubSheet(e.detail));

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
const closeCategory = attachCategoryInput(el.category);
let editingId = null;

// ===== アイコン画像 =====
const iconBtn = document.getElementById("subIconBtn");
const iconFile = document.getElementById("subIconFile");
const iconRemove = document.getElementById("subIconRemove");
let icon = "";

function renderIcon() {
  iconBtn.innerHTML = pickerHtml(icon);
  iconBtn.classList.toggle("has-image", !!icon);
  iconRemove.hidden = !icon;
}

iconBtn.addEventListener("click", () => iconFile.click());
iconFile.addEventListener("change", async () => {
  const file = iconFile.files?.[0];
  iconFile.value = "";
  if (!file) return;
  try {
    icon = await resizeImage(file);
    renderIcon();
  } catch {
    el.msg.textContent = "この画像は読み込めませんでした";
    el.msg.classList.add("error");
  }
});
iconRemove.addEventListener("click", () => { icon = ""; renderIcon(); });

// 引き落とし日の選択肢（1日〜31日。31日は月末として扱う）
for (let d = 1; d <= 31; d++) {
  el.day.add(new Option(d === 31 ? "月末" : `毎月${d}日`, String(d)));
}

export function openSubSheet(id = null) {
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
  icon = fc?.icon || "";
  renderIcon();
  closeCategory();
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
    endMonth: el.end.value || "",
    icon
  };
  if (data.endMonth && data.endMonth < data.startMonth) {
    el.msg.textContent = "終了月は開始月より後にしてください";
    el.msg.classList.add("error");
    return;
  }
  try {
    if (editingId) await updateDoc(doc(fixedRef(), editingId), data);
    else await addDoc(fixedRef(), { ...data, createdAt: serverTimestamp() });
    ensureCategory(data.category);
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
