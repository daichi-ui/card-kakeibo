// ===== 入力・編集の画面 =====
//   利用（Gmail・手入力）の追加／編集／削除／計算からの除外
//   サブスクの「この月だけ」の金額変更／計算からの除外
//   カテゴリの入力候補（オートコンプリート）
import {
  doc, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  state, subscribe, txRef, overrideRef, overrideId, knownCategories, rememberCategory
} from "./store.js";
import { today, yen, formatMonth, formatDayWeek, escapeHtml, normalizeCategory } from "./utils.js";

// ===== カテゴリの入力候補 =====
// 入力欄の下に候補を並べ、タップで入力する。入力中の文字で絞り込む
export function attachCategoryInput(input, chips) {
  const render = () => {
    const q = input.value.normalize("NFKC").trim().toLowerCase();
    const list = knownCategories()
      .filter((c) => c !== "未分類" && (!q || c.toLowerCase().includes(q)) && c.toLowerCase() !== q)
      .slice(0, 8);
    chips.innerHTML = list.map((c) =>
      `<button type="button" class="chip" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("");
    chips.hidden = list.length === 0;
  };
  input.addEventListener("input", render);
  input.addEventListener("focus", render);
  chips.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-cat]");
    if (!chip) return;
    input.value = chip.dataset.cat;
    render();
  });
  subscribe(render);
  return render;
}

// ===== 利用の画面 =====
const txSheet = document.getElementById("txSheet");
const txForm = document.getElementById("txForm");
const f = {
  title: document.getElementById("txTitle"),
  note: document.getElementById("txSourceNote"),
  date: document.getElementById("txDate"),
  time: document.getElementById("txTime"),
  store: document.getElementById("txStore"),
  amount: document.getElementById("txAmount"),
  category: document.getElementById("txCategory"),
  memo: document.getElementById("txMemo"),
  excluded: document.getElementById("txExcluded"),
  excludedRow: document.getElementById("txExcludedRow"),
  del: document.getElementById("txDelete"),
  msg: document.getElementById("txMsg")
};
const renderTxChips = attachCategoryInput(f.category, document.getElementById("txCategoryChips"));
let editing = null; // 編集中の利用（新規なら null）

function setMsg(el, text) {
  el.textContent = text;
  el.classList.toggle("error", !!text);
}

// 一覧の行をタップしたとき
export function openItem(item) {
  if (item.type === "fixed") openFixedItem(item);
  else openTxEdit(item.id);
}

// 手入力で追加
export function openTxNew(date = today()) {
  editing = null;
  txForm.reset();
  f.title.textContent = "利用を追加";
  f.date.value = date;
  f.note.hidden = true;
  f.del.hidden = true;
  f.excludedRow.hidden = true;
  setMsg(f.msg, "");
  renderTxChips();
  txSheet.showModal();
}

// 編集
export function openTxEdit(id) {
  const t = state.transactions.find((x) => x.id === id);
  if (!t) return;
  editing = t;
  txForm.reset();
  f.title.textContent = "利用を編集";
  f.date.value = t.date || "";
  f.time.value = t.time || "";
  f.store.value = t.store || "";
  f.amount.value = t.amount ?? "";
  f.category.value = t.category && t.category !== "未分類" ? t.category : "";
  f.memo.value = t.memo || "";
  f.excluded.checked = !!t.excluded;
  f.excludedRow.hidden = false;
  setMsg(f.msg, "");
  f.del.hidden = false;

  if (t.source === "mail") {
    f.note.hidden = false;
    f.note.innerHTML = t.needsReview
      ? `<strong>要確認</strong>：メールから金額などを読み取れませんでした。内容を確認して保存してください。${
          t.excerpt ? `<br><span class="sheet-quote">${escapeHtml(t.excerpt)}</span>` : ""}`
      : t.amount < 0
        ? "Gmail から自動で取り込んだ取消（返金）です。合計から差し引かれます。"
        : "Gmail から自動で取り込んだ利用です。サブスクと重なるときは「計算から除外」をオンにしてください。";
  } else {
    f.note.hidden = true;
  }
  renderTxChips();
  txSheet.showModal();
}

txForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const amount = Number(f.amount.value);
  // 取消（返金）はマイナスで入力できる
  if (!Number.isFinite(amount) || f.amount.value === "") {
    return setMsg(f.msg, "金額を正しく入力してください");
  }
  const category = normalizeCategory(f.category.value);
  const data = {
    date: f.date.value,
    time: f.time.value || "",
    store: f.store.value.trim() || "手入力",
    amount: Math.round(amount),
    category,
    memo: f.memo.value.trim(),
    needsReview: false // 保存したら確認済み
  };
  try {
    if (editing) {
      await updateDoc(doc(txRef(), editing.id), { ...data, excluded: f.excluded.checked });
    } else {
      await addDoc(txRef(), { ...data, excluded: false, source: "manual", createdAt: serverTimestamp() });
    }
    rememberCategory(category);
    txSheet.close();
  } catch (err) {
    setMsg(f.msg, "保存に失敗しました：" + err.message);
  }
});

f.del.addEventListener("click", async () => {
  if (!editing || !confirm(`${editing.store || "この利用"}（${yen(editing.amount)}）を削除しますか？`)) return;
  try {
    if (editing.source === "mail") {
      // メールの利用は「削除済み」の印を付ける（消すと次の自動取り込みでまた登録されるため）
      await updateDoc(doc(txRef(), editing.id), { deleted: true });
    } else {
      await deleteDoc(doc(txRef(), editing.id));
    }
    txSheet.close();
  } catch (err) {
    setMsg(f.msg, "削除に失敗しました：" + err.message);
  }
});

// ===== 計算からの除外を切り替える（一覧の丸いボタン） =====
export async function toggleExcluded(item) {
  try {
    if (item.type === "fixed") {
      await saveOverride(item, { skipped: !item.excluded });
    } else {
      await updateDoc(doc(txRef(), item.id), { excluded: !item.excluded });
    }
  } catch (err) {
    alert("切り替えに失敗しました：" + err.message);
  }
}

// ===== サブスク（この月の分）の画面 =====
const itemSheet = document.getElementById("fixedItemSheet");
const itemForm = document.getElementById("fixedItemForm");
const it = {
  title: document.getElementById("fixedItemTitle"),
  note: document.getElementById("fixedItemNote"),
  amount: document.getElementById("fixedItemAmount"),
  excluded: document.getElementById("fixedItemExcluded"),
  reset: document.getElementById("fixedItemReset"),
  edit: document.getElementById("fixedItemEdit")
};
let current = null; // 開いているサブスク（この月の分）

function openFixedItem(item) {
  current = item;
  it.title.textContent = item.store;
  it.note.textContent = `${formatMonth(item.month)}の分（${formatDayWeek(item.date)}）・いつもの金額 ${yen(item.baseAmount)}`;
  it.amount.value = item.amount;
  it.excluded.checked = item.excluded;
  it.reset.hidden = !item.changed;
  itemSheet.showModal();
}

// この月だけの変更を保存する（skipped / amount）
async function saveOverride(item, changes) {
  const id = overrideId(item.fixedId, item.month);
  const prev = state.fixedOverrides.find((o) => o.id === id) || {};
  await setDoc(doc(overrideRef(), id), {
    fixedId: item.fixedId,
    month: item.month,
    skipped: prev.skipped ?? false,
    amount: prev.amount ?? null,
    ...changes
  });
}

itemForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const amount = Math.round(Number(it.amount.value));
  if (!Number.isFinite(amount) || amount < 0) return;
  await saveOverride(current, {
    amount: amount === current.baseAmount ? null : amount,
    skipped: it.excluded.checked
  });
  itemSheet.close();
});
it.reset.addEventListener("click", async () => {
  await saveOverride(current, { amount: null });
  itemSheet.close();
});
it.edit.addEventListener("click", () => {
  itemSheet.close();
  window.dispatchEvent(new CustomEvent("edit-subscription", { detail: current.fixedId }));
});
