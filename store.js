// ===== データの読み込みと集計 =====
// Firestore の3つのデータを読み込み、各画面に知らせる
//   transactions   … カードの利用（メールから自動・手入力）
//   fixedCosts     … 固定費のひな形
//   fixedOverrides … 固定費の「この月だけ」の変更（削除・金額変更）
import { db } from "./firebase.js";
import {
  collection, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { daysInMonth } from "./utils.js";

export const state = {
  user: null,
  transactions: [],
  fixedCosts: [],
  fixedOverrides: [],
  error: null
};

const listeners = [];
let unsubscribes = [];

export function subscribe(fn) {
  listeners.push(fn);
}

function notify() {
  listeners.forEach((fn) => fn(state));
}

export const txRef = () => collection(db, "transactions");
export const fixedRef = () => collection(db, "fixedCosts");
export const overrideRef = () => collection(db, "fixedOverrides");

// ===== 開始／終了 =====
export function initStore(user) {
  state.user = user;
  state.error = null;
  const watch = (ref, key) => onSnapshot(ref, (snap) => {
    state[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    notify();
  }, (err) => {
    // ルールで許可されていないアカウントなど
    state.error = err.code === "permission-denied"
      ? "このアカウントではデータを見られません。登録したアカウントでログインし直してください。"
      : "データの読み込みに失敗しました：" + err.message;
    notify();
  });
  unsubscribes = [
    watch(txRef(), "transactions"),
    watch(fixedRef(), "fixedCosts"),
    watch(overrideRef(), "fixedOverrides")
  ];
}

export function stopStore() {
  unsubscribes.forEach((fn) => fn());
  unsubscribes = [];
  Object.assign(state, { user: null, transactions: [], fixedCosts: [], fixedOverrides: [], error: null });
  notify();
}

// ===== 集計 =====

// 固定費のこの月の変更データの ID
export const overrideId = (fixedId, month) => `${fixedId}_${month}`;

/**
 * ある月の利用一覧（カードの利用＋固定費）
 * 戻り値の各行：
 *   { type: "tx" | "fixed", id, date, time, store, amount, category, ... }
 *   固定費は skipped（この月だけ削除）なら合計に入れない
 */
export function monthItems(month) {
  const txs = state.transactions
    .filter((t) => !t.deleted && t.date?.startsWith(month))
    .map((t) => ({ type: "tx", ...t }));

  const fixed = state.fixedCosts
    .filter((f) => (!f.startMonth || f.startMonth <= month) && (!f.endMonth || month <= f.endMonth))
    .map((f) => {
      const ov = state.fixedOverrides.find((o) => o.id === overrideId(f.id, month));
      const day = Math.min(Number(f.day) || 1, daysInMonth(month));
      return {
        type: "fixed",
        id: f.id,
        fixedId: f.id,
        month,
        date: `${month}-${String(day).padStart(2, "0")}`,
        time: "",
        store: f.name,
        amount: ov && ov.amount !== null && ov.amount !== undefined ? Number(ov.amount) : Number(f.amount),
        changed: !!(ov && ov.amount !== null && ov.amount !== undefined),
        category: f.category || "未分類",
        memo: f.memo || "",
        skipped: !!ov?.skipped
      };
    });

  return [...txs, ...fixed].sort((a, b) =>
    b.date.localeCompare(a.date) || (b.time || "").localeCompare(a.time || ""));
}

// 合計に入る行だけ（この月だけ削除した固定費と、金額未入力のものを除く）
export function countable(items) {
  return items.filter((i) => !i.skipped && Number.isFinite(Number(i.amount)) && i.amount !== null);
}

// ある月の合計金額
export function monthTotal(month) {
  return countable(monthItems(month)).reduce((s, i) => s + Number(i.amount), 0);
}

// 要確認の利用
export function reviewItems() {
  return state.transactions
    .filter((t) => !t.deleted && t.needsReview)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

// 使ったことのあるカテゴリ（入力候補用）
export function knownCategories() {
  const set = new Set(["未分類"]);
  state.transactions.forEach((t) => t.category && set.add(t.category));
  state.fixedCosts.forEach((f) => f.category && set.add(f.category));
  return [...set];
}
