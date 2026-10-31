// ===== お店のアイコン（設定タブ・利用の編集画面から開く） =====
//   お店の名前（の一部）と画像を登録しておくと、名前が当てはまる利用に自動で画像が付く
//   データは書き換えず表示のときに判定するので、過去の利用にもこれからの利用にも付く
import {
  doc, addDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { state, storeIconRef, storesMatching, storeKey } from "./store.js";
import { resizeImage, pickerHtml } from "./images.js";
import { escapeHtml } from "./utils.js";
import { toast } from "./toast.js";

const sheet = document.getElementById("storeIconSheet");
const form = document.getElementById("storeIconForm");
const titleEl = document.getElementById("storeIconTitle");
const pickBtn = document.getElementById("storeIconBtn");
const fileEl = document.getElementById("storeIconFile");
const keywordEl = document.getElementById("storeIconKeyword");
const matchEl = document.getElementById("storeIconMatches");
const delEl = document.getElementById("storeIconDelete");
const msgEl = document.getElementById("storeIconMsg");

const PREVIEW = 6; // 当てはまるお店を何件まで見せるか
let editingId = null;
let icon = "";

export function openStoreIconSheet(id = null, keyword = "") {
  form.reset();
  setMsg("");
  const r = id && state.storeIcons.find((x) => x.id === id);
  editingId = r ? r.id : null;
  titleEl.textContent = r ? "お店のアイコンを編集" : "お店のアイコンを追加";
  keywordEl.value = r ? r.keyword : keyword;
  icon = r ? r.icon : "";
  delEl.hidden = !r;
  renderIcon();
  renderMatches();
  sheet.showModal();
}

function setMsg(text) {
  msgEl.textContent = text;
  msgEl.classList.toggle("error", !!text);
}

function renderIcon() {
  pickBtn.innerHTML = pickerHtml(icon);
  pickBtn.classList.toggle("has-image", !!icon);
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

pickBtn.addEventListener("click", () => fileEl.click());
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
  if (!icon) return setMsg("画像を選んでください");
  if (!storeKey(keyword)) return setMsg("お店の名前を入力してください");
  if (state.storeIcons.some((r) => r.id !== editingId && storeKey(r.keyword) === storeKey(keyword))) {
    return setMsg("同じ名前のアイコンがあります");
  }
  try {
    if (editingId) await updateDoc(doc(storeIconRef(), editingId), { keyword, icon });
    else await addDoc(storeIconRef(), { keyword, icon, createdAt: serverTimestamp() });
    sheet.close();
    toast(`「${keyword}」のアイコンを保存しました`);
  } catch (err) {
    setMsg("保存に失敗しました：" + err.message);
  }
});

delEl.addEventListener("click", async () => {
  const r = state.storeIcons.find((x) => x.id === editingId);
  if (!r || !confirm(`「${r.keyword}」のアイコンを削除しますか？`)) return;
  try {
    await deleteDoc(doc(storeIconRef(), r.id));
    sheet.close();
  } catch (err) {
    setMsg("削除に失敗しました：" + err.message);
  }
});
