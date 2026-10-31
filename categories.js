// ===== カテゴリ =====
//   入力欄のプルダウン：入力した文字を含むカテゴリだけを出す（空ならすべて）
//   カテゴリの追加・編集（名前・色・削除）
import {
  doc, addDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  state, subscribe, categoryRef, txRef, fixedRef, categoryNames, searchCategories, fold, categoryColor, PALETTE
} from "./store.js";
import { escapeHtml, normalizeCategory } from "./utils.js";

// 未登録のカテゴリを登録する（保存したときに自動で呼ぶ）
export async function ensureCategory(name) {
  const c = normalizeCategory(name);
  if (c === "未分類" || categoryNames().includes(c)) return;
  await addDoc(categoryRef(), { name: c, color: categoryColor(c), order: Date.now(), createdAt: serverTimestamp() });
}

// ===== プルダウン付きの入力欄 =====
// <div class="combo"> の中の input に付ける。リストは入力欄のすぐ下に開くので入力中の文字が隠れない
export function attachCategoryInput(input) {
  const combo = input.closest(".combo");
  const list = combo.querySelector(".combo-list");
  let active = -1;

  const items = () => [...list.querySelectorAll(".combo-option")];

  function render() {
    const q = input.value;
    const names = searchCategories(q);
    const key = fold(q);
    active = -1;
    list.innerHTML = names.length
      ? names.map((n) => {
          // 一致した部分を太字にする
          const i = key ? fold(n).indexOf(key) : -1;
          const label = i >= 0 && fold(n).length === n.length
            ? `${escapeHtml(n.slice(0, i))}<mark>${escapeHtml(n.slice(i, i + key.length))}</mark>${escapeHtml(n.slice(i + key.length))}`
            : escapeHtml(n);
          const selected = normalizeCategory(q) === n;
          return `<button type="button" class="combo-option ${selected ? "is-selected" : ""}" role="option" data-value="${escapeHtml(n)}"><span class="dot" style="--c:${categoryColor(n)}"></span>${label}</button>`;
        }).join("")
      : `<p class="combo-empty">${key ? "新しいカテゴリとして追加されます" : "カテゴリがありません"}</p>`;
  }

  function open() {
    render();
    combo.classList.add("is-open");
    // 入力欄が見えるよう、シートの上の方へ寄せる
    requestAnimationFrame(() => combo.scrollIntoView({ block: "start", behavior: "smooth" }));
  }

  function close() {
    combo.classList.remove("is-open");
  }

  function choose(value) {
    input.value = value;
    close();
  }

  input.addEventListener("focus", open);
  input.addEventListener("input", () => {
    if (!combo.classList.contains("is-open")) open();
    else render();
  });
  input.addEventListener("blur", () => setTimeout(close, 120));
  input.addEventListener("keydown", (e) => {
    const opts = items();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!opts.length) return;
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length;
      opts.forEach((o, i) => o.classList.toggle("is-active", i === active));
      opts[active].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(opts[active].dataset.value);
    } else if (e.key === "Escape") {
      close();
    }
  });
  // リストを押しても入力欄のフォーカスを外さない
  list.addEventListener("pointerdown", (e) => e.preventDefault());
  list.addEventListener("click", (e) => {
    const opt = e.target.closest("[data-value]");
    if (opt) choose(opt.dataset.value);
  });

  subscribe(() => combo.classList.contains("is-open") && render());
  return close;
}

// ===== カテゴリの追加・編集（設定タブから開く） =====
const sheet = document.getElementById("categorySheet");
const form = document.getElementById("categoryForm");
const titleEl = document.getElementById("categoryTitle");
const nameEl = document.getElementById("categoryName");
const swatchesEl = document.getElementById("categorySwatches");
const delEl = document.getElementById("categoryDelete");
const noteEl = document.getElementById("categoryNote");
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
  const count = c ? usageCount(c.name) : 0;
  noteEl.textContent = count ? `${count}件で使用中` : "";
  noteEl.hidden = !count;
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

async function renameEverywhere(from, to) {
  const txs = state.transactions.filter((t) => normalizeCategory(t.category) === from);
  const fcs = state.fixedCosts.filter((f) => normalizeCategory(f.category) === from);
  await Promise.all([
    ...txs.map((t) => updateDoc(doc(txRef(), t.id), { category: to })),
    ...fcs.map((f) => updateDoc(doc(fixedRef(), f.id), { category: to }))
  ]);
}

delEl.addEventListener("click", async () => {
  const c = state.categories.find((x) => x.id === editingId);
  if (!c || !confirm(`「${c.name}」を削除しますか？\n使用中の利用のカテゴリ名はそのまま残ります。`)) return;
  try {
    await deleteDoc(doc(categoryRef(), c.id));
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
