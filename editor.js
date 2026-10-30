// ===== 入力・編集の画面 =====
//   利用（メール・手入力）の追加／編集／削除
//   固定費の「この月だけ」の金額変更／削除
import {
  doc, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { state, txRef, overrideRef, overrideId } from "./store.js";
import { today, yen, formatMonth, formatDayWeek, escapeHtml } from "./utils.js";
import { openFixedSettings } from "./fixed.js";

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
  del: document.getElementById("txDelete"),
  msg: document.getElementById("txMsg")
};
let editing = null; // 編集中の利用（新規なら null）

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
  f.msg.textContent = "";
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
  f.msg.textContent = "";
  f.del.hidden = false;

  if (t.source === "mail") {
    f.note.hidden = false;
    f.note.innerHTML = t.needsReview
      ? `<strong>要確認</strong>：メールから金額などを読み取れませんでした。内容を確認して保存してください。${
          t.excerpt ? `<br><span class="sheet-quote">${escapeHtml(t.excerpt)}</span>` : ""}`
      : "メールから自動で取り込んだ利用です。取消になった利用は削除してください。";
  } else {
    f.note.hidden = true;
  }
  txSheet.showModal();
}

txForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const amount = Number(f.amount.value);
  if (!Number.isFinite(amount) || amount < 0) {
    f.msg.textContent = "金額を正しく入力してください";
    f.msg.classList.add("error");
    return;
  }
  const data = {
    date: f.date.value,
    time: f.time.value || "",
    store: f.store.value.trim(),
    amount: Math.round(amount),
    category: f.category.value.trim() || "未分類",
    memo: f.memo.value.trim(),
    needsReview: false // 保存したら確認済み
  };
  try {
    if (editing) {
      await updateDoc(doc(txRef(), editing.id), data);
    } else {
      await addDoc(txRef(), { ...data, source: "manual", createdAt: serverTimestamp() });
    }
    txSheet.close();
  } catch (err) {
    f.msg.textContent = "保存に失敗しました：" + err.message;
    f.msg.classList.add("error");
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
    f.msg.textContent = "削除に失敗しました：" + err.message;
    f.msg.classList.add("error");
  }
});

// ===== 固定費（この月の分）の画面 =====
const itemSheet = document.getElementById("fixedItemSheet");
const itemForm = document.getElementById("fixedItemForm");
const it = {
  title: document.getElementById("fixedItemTitle"),
  note: document.getElementById("fixedItemNote"),
  amount: document.getElementById("fixedItemAmount"),
  skip: document.getElementById("fixedItemSkip"),
  restore: document.getElementById("fixedItemRestore"),
  reset: document.getElementById("fixedItemReset")
};
let current = null; // 開いている固定費（この月の分）

function openFixedItem(item) {
  current = item;
  const base = state.fixedCosts.find((x) => x.id === item.fixedId);
  it.title.textContent = item.store;
  it.note.innerHTML = `${formatMonth(item.month)}の固定費（${formatDayWeek(item.date)}）<br>いつもの金額：${yen(base?.amount)}
    ・<button type="button" class="link-button" id="fixedItemOpenSettings">固定費の設定</button>`;
  it.amount.value = item.amount;
  it.amount.disabled = item.skipped;
  it.skip.hidden = item.skipped;
  it.restore.hidden = !item.skipped;
  it.reset.hidden = !item.changed || item.skipped;
  document.getElementById("fixedItemSubmit").hidden = item.skipped;
  document.getElementById("fixedItemOpenSettings").onclick = () => {
    itemSheet.close();
    openFixedSettings(item.fixedId);
  };
  itemSheet.showModal();
}

// この月だけの変更を保存する（skipped / amount）
async function saveOverride(changes) {
  const id = overrideId(current.fixedId, current.month);
  const prev = state.fixedOverrides.find((o) => o.id === id) || {};
  await setDoc(doc(overrideRef(), id), {
    fixedId: current.fixedId,
    month: current.month,
    skipped: prev.skipped ?? false,
    amount: prev.amount ?? null,
    ...changes
  });
  itemSheet.close();
}

itemForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const amount = Math.round(Number(it.amount.value));
  if (!Number.isFinite(amount) || amount < 0) return;
  const base = state.fixedCosts.find((x) => x.id === current.fixedId);
  saveOverride({ amount: amount === Number(base?.amount) ? null : amount });
});
it.skip.addEventListener("click", () => {
  if (confirm(`${formatMonth(current.month)}の「${current.store}」だけを削除しますか？\n（翌月以降はそのまま残ります）`)) {
    saveOverride({ skipped: true });
  }
});
it.restore.addEventListener("click", () => saveOverride({ skipped: false }));
it.reset.addEventListener("click", () => saveOverride({ amount: null }));
