// ===== カテゴリ =====
//   入力欄のプルダウン：入力した文字を含むカテゴリだけを出す（空ならすべて）
//   カテゴリの追加・編集（名前・色・削除）
import {
  doc, addDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  state, subscribe, categoryRef, txRef, fixedRef, storeIconRef, categoryNames, searchCategories, fold, categoryColor, PALETTE
} from "./store.js";
import { escapeHtml, normalizeCategory } from "./utils.js";

// 未登録のカテゴリを登録する（保存したときに自動で呼ぶ）
export async function ensureCategory(name) {
  const c = normalizeCategory(name);
  if (c === "未分類" || categoryNames().includes(c)) return;
  await addDoc(categoryRef(), { name: c, color: categoryColor(c), order: Date.now(), createdAt: serverTimestamp() });
}

// ===== カテゴリの選び方（利用・サブスク・お店のアイコンの入力画面） =====
// 登録済みのカテゴリを色付きのボタンで全部並べ、タップで選ぶ（キーボードは出さない）
// 新しいカテゴリは「＋ 新しいカテゴリ」を押したときだけ入力欄を出す
// 選んだ値は <input type="hidden"> に入れる（空＝未分類／設定しない）
// 戻り値：入力画面を開くときに呼ぶ関数（hidden の値に合わせて描き直す）
export function attachCategoryInput(input) {
  const box = input.closest(".catpick");
  const chips = box.querySelector(".catpick-chips");
  const emptyLabel = box.dataset.empty || "未分類";
  let adding = false;

  const chip = (value, label, color, selected) => `
    <button type="button" class="q-cat ${selected ? "is-selected" : ""}" role="radio" aria-checked="${selected}"
            data-value="${escapeHtml(value)}" style="--c:${color}"><span class="dot"></span>${escapeHtml(label)}</button>`;

  function render() {
    const cur = normalizeCategory(input.value);
    const current = cur === "未分類" ? "" : cur;
    const names = categoryNames();
    // 未登録のカテゴリが入っているときも選んだ状態で見せる
    if (current && !names.includes(current)) names.push(current);
    chips.innerHTML = [
      chip("", emptyLabel, categoryColor("未分類"), !current),
      ...names.map((n) => chip(n, n, categoryColor(n), n === current))
    ].join("") + (adding
      ? `<span class="catpick-new">
           <input type="text" maxlength="30" placeholder="カテゴリ名" enterkeyhint="done" aria-label="新しいカテゴリ名">
           <button type="button" data-add-ok>追加</button>
         </span>`
      : `<button type="button" class="q-cat catpick-add" data-add>＋ 新しいカテゴリ</button>`);
  }

  function addNew() {
    const el = chips.querySelector(".catpick-new input");
    const v = normalizeCategory(el?.value);
    if (v !== "未分類") input.value = v;
    adding = false;
    render();
  }

  chips.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-add")) {
      adding = true;
      render();
      chips.querySelector(".catpick-new input").focus();
    } else if (b.hasAttribute("data-add-ok")) {
      addNew();
    } else if (b.dataset.value !== undefined) {
      input.value = b.dataset.value;
      render();
    }
  });
  chips.addEventListener("keydown", (e) => {
    if (!e.target.closest(".catpick-new")) return;
    if (e.key === "Enter") { e.preventDefault(); addNew(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); adding = false; render(); }
  });
  // 何も入れずに入力欄から離れたら、元のボタンに戻す
  chips.addEventListener("focusout", (e) => {
    const el = e.target.closest(".catpick-new input");
    if (el && !el.value.trim() && !chips.contains(e.relatedTarget)) {
      setTimeout(() => { if (adding && !el.value.trim()) { adding = false; render(); } }, 150);
    }
  });

  subscribe(() => { if (!adding) render(); });
  return () => { adding = false; render(); };
}

// ===== カテゴリの追加・編集（設定タブから開く） =====
const sheet = document.getElementById("categorySheet");
const form = document.getElementById("categoryForm");
const titleEl = document.getElementById("categoryTitle");
const nameEl = document.getElementById("categoryName");
const swatchesEl = document.getElementById("categorySwatches");
const delEl = document.getElementById("categoryDelete");
const msgEl = document.getElementById("categoryMsg");
let editingId = null;
let color = PALETTE.at(0);

swatchesEl.innerHTML = PALETTE.map((c) =>
  `<button type="button" class="swatch" data-color="${c}" style="--c:${c}" aria-label="色 ${c}"></button>`).join("");
swatchesEl.addEventListener("click", (e) => {
  const b = e.target.closest("[data-color]");
  if (b) setColor(b.dataset.color);
});

function setColor(c) {
  color = c;
  swatchesEl.querySelectorAll("[data-color]").forEach((b) => {
    b.classList.toggle("is-selected", b.dataset.color === c);
    b.setAttribute("aria-pressed", String(b.dataset.color === c));
  });
}

// カテゴリごとの使用件数
export function usageCount(name) {
  return state.transactions.filter((t) => !t.deleted && normalizeCategory(t.category) === name).length +
    state.storeIcons.filter((r) => r.category && normalizeCategory(r.category) === name).length +
    state.fixedCosts.filter((f) => normalizeCategory(f.category) === name).length;
}

// id：編集するカテゴリ。name：未登録のカテゴリを登録するときの名前
export function openCategorySheet(id = null, name = "") {
  form.reset();
  msgEl.textContent = "";
  const c = id && state.categories.find((x) => x.id === id);
  editingId = c ? c.id : null;
  titleEl.textContent = c ? "カテゴリを編集" : "カテゴリを追加";
  nameEl.value = c ? c.name : name;
  // 使われていない色を初期値にする
  const used = new Set(state.categories.map((x) => x.color));
  setColor(c ? categoryColor(c.name) : name ? categoryColor(name) : PALETTE.find((p) => !used.has(p)) || PALETTE.at(0));
  delEl.hidden = !c;
  sheet.showModal();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = normalizeCategory(nameEl.value);
  if (name === "未分類") return setMsg("名前を入力してください");
  if (state.categories.some((c) => c.name === name && c.id !== editingId)) return setMsg("同じ名前のカテゴリがあります");
  try {
    if (editingId) {
      const before = state.categories.find((c) => c.id === editingId);
      await updateDoc(doc(categoryRef(), editingId), { name, color });
      // 名前を変えたら、そのカテゴリの利用とサブスクもまとめて変える（レポートの表記をそろえる）
      if (before && before.name !== name) await renameEverywhere(before.name, name);
    } else {
      await addDoc(categoryRef(), { name, color, order: Date.now(), createdAt: serverTimestamp() });
    }
    sheet.close();
  } catch (err) {
    setMsg("保存に失敗しました：" + err.message);
  }
});

function setMsg(text) {
  msgEl.textContent = text;
  msgEl.classList.add("error");
}

// カテゴリを消したら、使っているところもまとめて「未分類」に戻す
async function clearEverywhere(name) {
  const txs = state.transactions.filter((t) => normalizeCategory(t.category) === name);
  const fcs = state.fixedCosts.filter((f) => normalizeCategory(f.category) === name);
  const sis = state.storeIcons.filter((r) => r.category && normalizeCategory(r.category) === name);
  await Promise.all([
    ...txs.map((t) => updateDoc(doc(txRef(), t.id), { category: "未分類" })),
    ...fcs.map((f) => updateDoc(doc(fixedRef(), f.id), { category: "未分類" })),
    ...sis.map((r) => updateDoc(doc(storeIconRef(), r.id), { category: "" }))
  ]);
}

async function renameEverywhere(from, to) {
  const txs = state.transactions.filter((t) => normalizeCategory(t.category) === from);
  const fcs = state.fixedCosts.filter((f) => normalizeCategory(f.category) === from);
  const sis = state.storeIcons.filter((r) => r.category && normalizeCategory(r.category) === from);
  await Promise.all([
    ...txs.map((t) => updateDoc(doc(txRef(), t.id), { category: to })),
    ...fcs.map((f) => updateDoc(doc(fixedRef(), f.id), { category: to })),
    ...sis.map((r) => updateDoc(doc(storeIconRef(), r.id), { category: to }))
  ]);
}

delEl.addEventListener("click", async () => {
  const c = state.categories.find((x) => x.id === editingId);
  if (!c || !confirm(`「${c.name}」を削除しますか？\nこのカテゴリの利用・サブスク・お店のアイコンは「未分類」になります。`)) return;
  try {
    await deleteDoc(doc(categoryRef(), c.id));
    await clearEverywhere(c.name);
    sheet.close();
  } catch (err) {
    setMsg("削除に失敗しました：" + err.message);
  }
});

// 未登録のカテゴリをまとめて登録する
export async function registerAll(names) {
  await Promise.all(names.map((n, i) =>
    addDoc(categoryRef(), { name: n, color: categoryColor(n), order: Date.now() + i, createdAt: serverTimestamp() })));
}
