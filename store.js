// ===== データの読み込みと集計 =====
// Firestore の3つのデータを1か所で管理し、各画面に知らせる
//   transactions   … カードの利用（Gmail から自動・手入力）
//   fixedCosts     … サブスク（固定費）のひな形
//   fixedOverrides … サブスクの「この月だけ」の変更（計算から除外・金額変更）
// どの画面も monthItems() を通してデータを見るので、
// Gmail・手入力・サブスクの合計はすべての画面で同じになる
import { db } from "./firebase.js";
import {
  collection, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { daysInMonth, normalizeCategory } from "./utils.js";

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

export function notify() {
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

// サブスクのこの月の変更データの ID
export const overrideId = (fixedId, month) => `${fixedId}_${month}`;

// その月に有効なサブスクか
export function isActiveIn(f, month) {
  return (!f.startMonth || f.startMonth <= month) && (!f.endMonth || month <= f.endMonth);
}

/**
 * ある期間（"2026-10" や "2026"）の利用一覧（カードの利用＋サブスク）
 * 戻り値の各行：
 *   { type: "tx" | "fixed", id, date, time, store, amount, category, excluded, ... }
 *   excluded（計算から除外）の行は、合計に入れない（一覧には取り消し線で表示）
 */
export function monthItems(month) {
  const txs = state.transactions
    .filter((t) => !t.deleted && t.date?.startsWith(month))
    .map((t) => ({ type: "tx", ...t, excluded: !!t.excluded }));

  const fixed = state.fixedCosts
    .filter((f) => isActiveIn(f, month))
    .map((f) => {
      const ov = state.fixedOverrides.find((o) => o.id === overrideId(f.id, month));
      const day = Math.min(Number(f.day) || 1, daysInMonth(month));
      const changed = !!(ov && ov.amount !== null && ov.amount !== undefined);
      return {
        type: "fixed",
        id: f.id,
        fixedId: f.id,
        month,
        date: `${month}-${String(day).padStart(2, "0")}`,
        time: "",
        store: f.name,
        amount: changed ? Number(ov.amount) : Number(f.amount),
        baseAmount: Number(f.amount),
        changed,
        category: f.category || "未分類",
        memo: f.memo || "",
        excluded: !!ov?.skipped
      };
    });

  return [...txs, ...fixed].sort((a, b) =>
    b.date.localeCompare(a.date) || (b.time || "").localeCompare(a.time || ""));
}

// 年単位の一覧（"2026" → 1〜12月）
export function yearItems(year) {
  return Array.from({ length: 12 }, (_, i) => monthItems(`${year}-${String(i + 1).padStart(2, "0")}`)).flat();
}

// 合計に入る行だけ（除外したものと、金額未入力のものを除く）
export function countable(items) {
  return items.filter((i) => !i.excluded && i.amount !== null && i.amount !== undefined &&
    Number.isFinite(Number(i.amount)));
}

export function sum(items) {
  return countable(items).reduce((s, i) => s + Number(i.amount), 0);
}

// ある月の合計金額
export function monthTotal(month) {
  return sum(monthItems(month));
}

// ある月のサブスクの合計金額
export function monthFixedTotal(month) {
  return sum(monthItems(month).filter((i) => i.type === "fixed"));
}

// ある日の一覧と合計
export function dayItems(date) {
  return monthItems(date.slice(0, 7)).filter((i) => i.date === date);
}

// 要確認の利用
export function reviewItems() {
  return state.transactions
    .filter((t) => !t.deleted && t.needsReview)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

// カテゴリごとの合計（多い順）
export function categoryTotals(items) {
  const byCat = new Map();
  countable(items).forEach((i) => {
    const c = normalizeCategory(i.category);
    byCat.set(c, (byCat.get(c) || 0) + Number(i.amount));
  });
  return [...byCat.entries()].sort((a, b) => b[1] - a[1]);
}

// ===== カテゴリの入力候補 =====
// 入力したカテゴリをブラウザに保存し、データに含まれるカテゴリと合わせて候補にする
// （表記揺れを防ぐため、よく使うものほど上に出す）
const CATEGORY_KEY = "card-kakeibo.categories";

function loadSavedCategories() {
  try {
    const v = JSON.parse(localStorage.getItem(CATEGORY_KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function rememberCategory(name) {
  const c = normalizeCategory(name);
  if (c === "未分類") return;
  try {
    const saved = loadSavedCategories();
    saved[c] = (saved[c] || 0) + 1;
    localStorage.setItem(CATEGORY_KEY, JSON.stringify(saved));
  } catch {
    // 保存できない環境（プライベートブラウズなど）でも動くようにする
  }
  notify();
}

export function knownCategories() {
  const count = new Map(Object.entries(loadSavedCategories()));
  const add = (c) => {
    if (!c) return;
    const n = normalizeCategory(c);
    count.set(n, (count.get(n) || 0) + 1);
  };
  state.transactions.forEach((t) => add(t.category));
  state.fixedCosts.forEach((f) => add(f.category));
  count.delete("未分類");
  return [...[...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c), "未分類"];
}
