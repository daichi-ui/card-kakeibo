// ===== カテゴリ =====
//   カテゴリ設定（登録・名前の変更・削除）
//   入力欄のプルダウン：入力した文字を含むカテゴリだけを出す（空ならすべて）
import {
  doc, addDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  state, subscribe, categoryRef, txRef, fixedRef, categoryNames, unregisteredCategories, searchCategories, fold
} from "./store.js";
import { escapeHtml, normalizeCategory } from "./utils.js";

// 未登録のカテゴリを登録する（保存したときに自動で呼ぶ）
export async function ensureCategory(name) {
  const c = normalizeCategory(name);
  if (c === "未分類" || categoryNames().includes(c)) return;
  await addDoc(categoryRef(), { name: c, order: Date.now(), createdAt: serverTimestamp() });
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
          return `<button type="button" class="combo-option ${selected ? "is-selected" : ""}" role="option" data-value="${escapeHtml(n)}">${label}</button>`;
        }).join("")
      : `<p class="combo-empty">${key ? "新しいカテゴリとして保存されます" : "カテゴリ設定で登録してください"}</p>`;
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

// ===== カテゴリ設定 =====
const sheet = document.getElementById("categorySheet");
const form = document.getElementById("categoryForm");
const nameEl = document.getElementById("categoryName");
const submitEl = document.getElementById("categorySubmit");
const cancelEl = document.getElementById("categoryCancel");
const listEl = document.getElementById("categoryList");
const unusedTitle = document.getElementById("categoryUnregisteredTitle");
const unusedEl = document.getElementById("categoryUnregistered");
const msgEl = document.getElementById("categoryMsg");
let editingId = null;

export function openCategorySettings() {
  resetForm();
  sheet.showModal();
}

function resetForm() {
  editingId = null;
  form.reset();
  submitEl.textContent = "追加";
  cancelEl.hidden = true;
  setMsg("");
}

function setMsg(text, isError = true) {
  msgEl.textContent = text;
  msgEl.classList.toggle("error", isError);
}

// カテゴリごとの使用件数
function usageCount(name) {
  return state.transactions.filter((t) => !t.deleted && normalizeCategory(t.category) === name).length +
    state.fixedCosts.filter((f) => normalizeCategory(f.category) === name).length;
}

function render() {
  if (!state.user) return;
  const sorted = [...state.categories]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "ja"));
  listEl.innerHTML = state.categoryError
    ? `<p class="empty">${escapeHtml(state.categoryError)}</p>`
    : sorted.length
      ? sorted.map((c) => `
          <div class="row ${c.id === editingId ? "is-editing" : ""}">
            <button type="button" class="row-main" data-edit="${escapeHtml(c.id)}">
              <span class="row-head">
                <span class="row-title">${escapeHtml(c.name)}</span>
                <span class="row-count">${usageCount(c.name)}件</span>
              </span>
            </button>
            <button type="button" class="row-toggle row-delete" data-delete="${escapeHtml(c.id)}" aria-label="${escapeHtml(c.name)}を削除">
              <svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>
            </button>
          </div>`).join("")
      : `<p class="empty">まだありません</p>`;

  const unused = unregisteredCategories();
  unusedTitle.hidden = unusedEl.hidden = unused.length === 0;
  unusedEl.innerHTML = unused.length ? `
    ${unused.map((c) => `<button type="button" class="chip" data-add="${escapeHtml(c)}">＋ ${escapeHtml(c)}</button>`).join("")}
    ${unused.length > 1 ? `<button type="button" class="chip chip-strong" data-add-all>すべて追加</button>` : ""}` : "";
}
subscribe(render);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = normalizeCategory(nameEl.value);
  if (name === "未分類") return setMsg("名前を入力してください");
  const dup = state.categories.find((c) => c.name === name && c.id !== editingId);
  if (dup) return setMsg("同じ名前のカテゴリがあります");
  try {
    if (editingId) {
      const before = state.categories.find((c) => c.id === editingId);
      await updateDoc(doc(categoryRef(), editingId), { name });
      // 名前を変えたら、そのカテゴリの利用とサブスクもまとめて変える（レポートの表記をそろえる）
      if (before && before.name !== name) await renameEverywhere(before.name, name);
    } else {
      await addDoc(categoryRef(), { name, order: Date.now(), createdAt: serverTimestamp() });
    }
    resetForm();
  } catch (err) {
    setMsg("保存に失敗しました：" + err.message);
  }
});

async function renameEverywhere(from, to) {
  const txs = state.transactions.filter((t) => normalizeCategory(t.category) === from);
  const fcs = state.fixedCosts.filter((f) => normalizeCategory(f.category) === from);
  await Promise.all([
    ...txs.map((t) => updateDoc(doc(txRef(), t.id), { category: to })),
    ...fcs.map((f) => updateDoc(doc(fixedRef(), f.id), { category: to }))
  ]);
}

cancelEl.addEventListener("click", () => { resetForm(); render(); });

listEl.addEventListener("click", async (e) => {
  const edit = e.target.closest("[data-edit]");
  const del = e.target.closest("[data-delete]");
  if (edit) {
    const c = state.categories.find((x) => x.id === edit.dataset.edit);
    if (!c) return;
    editingId = c.id;
    nameEl.value = c.name;
    submitEl.textContent = "変更";
    cancelEl.hidden = false;
    setMsg("");
    render();
    nameEl.focus();
  }
  if (del) {
    const c = state.categories.find((x) => x.id === del.dataset.delete);
    if (!c || !confirm(`「${c.name}」を削除しますか？`)) return;
    try {
      await deleteDoc(doc(categoryRef(), c.id));
      if (editingId === c.id) resetForm();
    } catch (err) {
      setMsg("削除に失敗しました：" + err.message);
    }
  }
});

unusedEl.addEventListener("click", async (e) => {
  const one = e.target.closest("[data-add]");
  const all = e.target.closest("[data-add-all]");
  const names = all ? unregisteredCategories() : one ? [one.dataset.add] : [];
  try {
    await Promise.all(names.map((n, i) =>
      addDoc(categoryRef(), { name: n, order: Date.now() + i, createdAt: serverTimestamp() })));
  } catch (err) {
    setMsg("追加に失敗しました：" + err.message);
  }
});
