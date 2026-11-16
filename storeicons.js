// ===== お店のアイコン（設定タブ・利用の編集画面から開く） =====
//   お店の名前（の一部）と画像を登録しておくと、名前が当てはまる利用に自動で画像が付く
//   データは書き換えず表示のときに判定するので、過去の利用にもこれからの利用にも付く
import {
  doc, addDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { state, subscribe, storeIconRef, txRef, storesMatching, storeKey, bestIcon } from "./store.js";
import { resizeImage, pickerHtml } from "./images.js";
import { escapeHtml, normalizeCategory } from "./utils.js";
import { attachCategoryInput, ensureCategory } from "./categories.js";
import { toast } from "./toast.js";

const sheet = document.getElementById("storeIconSheet");
const form = document.getElementById("storeIconForm");
const titleEl = document.getElementById("storeIconTitle");
const pickBtn = document.getElementById("storeIconBtn");
const fileEl = document.getElementById("storeIconFile");
const keywordEl = document.getElementById("storeIconKeyword");
const categoryEl = document.getElementById("storeIconCategory");
const matchEl = document.getElementById("storeIconMatches");
const delEl = document.getElementById("storeIconDelete");
const msgEl = document.getElementById("storeIconMsg");

const PREVIEW = 6; // 当てはまるお店を何件まで見せるか
const closeCategory = attachCategoryInput(categoryEl);
let editingId = null;
let icon = "";

export function openStoreIconSheet(id = null, keyword = "") {
  form.reset();
  setMsg("");
  const r = id && state.storeIcons.find((x) => x.id === id);
  editingId = r ? r.id : null;
  titleEl.textContent = r ? "お店のアイコンを編集" : "お店のアイコンを追加";
  keywordEl.value = r ? r.keyword : keyword;
  categoryEl.value = r?.category && normalizeCategory(r.category) !== "未分類" ? r.category : "";
  icon = r ? r.icon : "";
  delEl.hidden = !r;
  renderIcon();
  renderMatches();
  closeCategory();
  sheet.showModal();
}

function setMsg(text) {
  msgEl.textContent = text;
  msgEl.classList.toggle("error", !!text);
}

function renderIcon() {
  pickBtn.innerHTML = pickerHtml(icon);
}

// 入力した名前に当てはまるお店を、その場で見せる
function renderMatches() {
  const names = storesMatching(keywordEl.value);
  if (!keywordEl.value.trim()) {
    matchEl.innerHTML = "";
    return;
  }
  matchEl.innerHTML = names.length
    ? `<span class="match-label">${names.length}件のお店に付きます</span>
       ${names.slice(0, PREVIEW).map((n) => `<span class="match-chip">${escapeHtml(n)}</span>`).join("")}
       ${names.length > PREVIEW ? `<span class="match-more">ほか${names.length - PREVIEW}件</span>` : ""}`
    : `<span class="match-label">今のところ当てはまるお店はありません</span>`;
}
keywordEl.addEventListener("input", renderMatches);

fileEl.addEventListener("change", async () => {
  const file = fileEl.files?.[0];
  fileEl.value = "";
  if (!file) return;
  try {
    icon = await resizeImage(file);
    renderIcon();
    setMsg("");
  } catch {
    setMsg("この画像は読み込めませんでした");
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const keyword = keywordEl.value.trim();
  // 空なら設定しない（""）。「未分類」と入れたときも設定しない扱い
  const cat = normalizeCategory(categoryEl.value);
  const category = cat === "未分類" ? "" : cat;
  if (!icon) return setMsg("画像を選んでください");
  if (!storeKey(keyword)) return setMsg("お店の名前を入力してください");
  if (state.storeIcons.some((r) => r.id !== editingId && storeKey(r.keyword) === storeKey(keyword))) {
    return setMsg("同じ名前のアイコンがあります");
  }
  try {
    const before = [...state.storeIcons];
    const id = editingId || "__new";
    const after = [...before.filter((r) => r.id !== id), { id, keyword, icon, category }];
    if (editingId) await updateDoc(doc(storeIconRef(), editingId), { keyword, icon, category });
    else await addDoc(storeIconRef(), { keyword, icon, category, createdAt: serverTimestamp() });
    if (category) ensureCategory(category);
    const n = await syncTxCategories(before, after, id);
    sheet.close();
    toast(n ? `「${keyword}」を保存し、${n}件の利用のカテゴリを変えました` : `「${keyword}」のアイコンを保存しました`);
  } catch (err) {
    setMsg("保存に失敗しました：" + err.message);
  }
});

// 読み込み・更新のたびに、カテゴリを設定したアイコンに当てはまる利用のカテゴリをそろえる
// （前から設定してあったアイコンや、Gmail から新しく届いた利用（未分類で届く）にも付ける）
let applying = false;
let applyTimer = null;
subscribe(() => {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(applyStoreCategories, 400);
});
async function applyStoreCategories() {
  if (applying || !state.user || !state.loaded.transactions || !state.loaded.storeIcons) return;
  const jobs = [];
  state.transactions.forEach((t) => {
    if (t.deleted || !t.store) return;
    const c = normalizeCategory(bestIcon(state.storeIcons, t.store)?.category);
    if (c !== "未分類" && normalizeCategory(t.category) !== c) {
      jobs.push(updateDoc(doc(txRef(), t.id), { category: c }));
    }
  });
  if (!jobs.length) return;
  applying = true;
  try { await Promise.all(jobs); } catch { /* 書き込めなくても表示は store.js 側で合わせている */ }
  applying = false;
}

// お店のアイコンのカテゴリを、当てはまる利用のデータにも書き込む
//   設定した → 当てはまる利用をそのカテゴリにする
//   外した・アイコンを消した → このアイコンで付いていたカテゴリを「未分類」に戻す
// 変えた件数を返す
async function syncTxCategories(before, after, id) {
  const jobs = [];
  state.transactions.forEach((t) => {
    if (t.deleted || !t.store) return;
    const old = bestIcon(before, t.store);
    const now = bestIcon(after, t.store);
    if (old?.id !== id && now?.id !== id) return; // このアイコンに関係ない利用
    const current = normalizeCategory(t.category);
    let next = current;
    if (now?.category) next = normalizeCategory(now.category);
    else if (old?.category && normalizeCategory(old.category) === current) next = "未分類";
    if (next !== current) jobs.push(updateDoc(doc(txRef(), t.id), { category: next }));
  });
  await Promise.all(jobs);
  return jobs.length;
}

delEl.addEventListener("click", async () => {
  const r = state.storeIcons.find((x) => x.id === editingId);
  if (!r || !confirm(`「${r.keyword}」のアイコンを削除しますか？`)) return;
  try {
    const before = [...state.storeIcons];
    await deleteDoc(doc(storeIconRef(), r.id));
    await syncTxCategories(before, before.filter((x) => x.id !== r.id), r.id);
    sheet.close();
  } catch (err) {
    setMsg("削除に失敗しました：" + err.message);
  }
});
