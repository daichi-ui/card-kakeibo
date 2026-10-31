// ===== データの読み込みと集計 =====
// Firestore の3つのデータを1か所で管理し、各画面に知らせる
//   transactions   … カードの利用（Gmail から自動・手入力）
//   fixedCosts     … サブスク（固定費）のひな形
//   fixedOverrides … サブスクの「この月だけ」の変更（計算から除外・金額変更）
//   categories     … カテゴリの一覧（カテゴリ設定で登録）
//   storeIcons     … お店のアイコン（お店の名前の一部と画像）
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
  categories: [],
  storeIcons: [],
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
export const categoryRef = () => collection(db, "categories");
export const storeIconRef = () => collection(db, "storeIcons");

// ===== 開始／終了 =====
export function initStore(user) {
  state.user = user;
  state.error = null;
  const watch = (ref, key) => onSnapshot(ref, (snap) => {
    state[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    notify();
  }, (err) => {
    if (key === "storeIcons") {
      // お店のアイコンが読めなくても、ほかの画面は使えるようにする
      state.storeIconError = err.code === "permission-denied"
        ? "お店のアイコンを読み込めません。Firestore のルールで storeIcons を許可してください。"
        : "お店のアイコンの読み込みに失敗しました：" + err.message;
      notify();
      return;
    }
    if (key === "categories") {
      // カテゴリだけ読めないときは、ほかの画面は使えるようにする
      state.categoryError = err.code === "permission-denied"
        ? "カテゴリを読み込めません。Firestore のルールで categories を許可してください。"
        : "カテゴリの読み込みに失敗しました：" + err.message;
      notify();
      return;
    }
    // ルールで許可されていないアカウントなど
    state.error = err.code === "permission-denied"
      ? "このアカウントではデータを見られません。登録したアカウントでログインし直してください。"
      : "データの読み込みに失敗しました：" + err.message;
    notify();
  });
  unsubscribes = [
    watch(txRef(), "transactions"),
    watch(fixedRef(), "fixedCosts"),
    watch(overrideRef(), "fixedOverrides"),
    watch(categoryRef(), "categories"),
    watch(storeIconRef(), "storeIcons")
  ];
}

export function stopStore() {
  unsubscribes.forEach((fn) => fn());
  unsubscribes = [];
  Object.assign(state, { user: null, transactions: [], fixedCosts: [], fixedOverrides: [], categories: [], storeIcons: [], error: null, categoryError: null, storeIconError: null });
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
        icon: f.icon || "",
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

// ===== カテゴリ =====

// 登録済みのカテゴリ名（並び順どおり）
export function categoryNames() {
  return [...state.categories]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "ja"))
    .map((c) => c.name);
}

// データで使われているのに、カテゴリ設定に登録されていないもの
export function unregisteredCategories() {
  const registered = new Set(categoryNames());
  const used = new Set();
  state.transactions.forEach((t) => !t.deleted && t.category && used.add(normalizeCategory(t.category)));
  state.fixedCosts.forEach((f) => f.category && used.add(normalizeCategory(f.category)));
  used.delete("未分類");
  return [...used].filter((c) => !registered.has(c)).sort((a, b) => a.localeCompare(b, "ja"));
}

// 部分一致で探す（全角半角・大文字小文字・ひらがなカタカナの違いを無視）
export function fold(str) {
  return String(str ?? "").normalize("NFKC").toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "");
}

export function searchCategories(q) {
  const key = fold(q);
  const names = categoryNames();
  return key ? names.filter((n) => fold(n).includes(key)) : names;
}

// ===== カテゴリの色 =====
// 一覧のアイコン・円グラフ・カテゴリ設定で同じ色を使う
export const PALETTE = [
  "#0A84FF", "#34C759", "#FF9500", "#FF2D55", "#AF52DE", "#5AC8FA",
  "#FFCC00", "#A2845E", "#5856D6", "#30B0C7", "#FF6B6B", "#00C7BE",
  "#FF3B30", "#64D2FF", "#BF5AF2", "#FFD60A", "#32D74B", "#FF9F0A",
  "#5E5CE6", "#AC8E68", "#E85D9E", "#3A7BD5", "#2EB872", "#F2994A"
];
export const UNCATEGORIZED_COLOR = "#8E8E93";

export function categoryColor(name) {
  const n = normalizeCategory(name);
  if (n === "未分類") return UNCATEGORIZED_COLOR;
  const c = state.categories.find((x) => x.name === n);
  if (c?.color) return c.color;
  // 登録済みで色がないものは、並び順で違う色を割り当てる
  const i = categoryNames().indexOf(n);
  if (i >= 0) return PALETTE.at(i % PALETTE.length);
  // 未登録のカテゴリは、名前から毎回同じ色を選ぶ
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return PALETTE.at(h % PALETTE.length);
}

// ===== お店のアイコン =====
// お店の名前に、登録した名前（の一部）が含まれていればその画像を使う
// 全角半角・大文字小文字・ひらがなカタカナ・空白・記号（ー - ・ . など）の違いは無視
// いくつも当てはまるときは長い名前を優先
// 例：「ｾﾌﾞﾝ-ｲﾚﾌﾞﾝ」「セブン－イレブン　渋谷店」→ 登録名「セブン」の画像
export function storeKey(str) {
  return fold(str).replace(/[‐－―ー−\-・･.,'’&＆*＊()（）]/g, "");
}

let iconCache = { list: null, map: new Map() };

export function storeIconFor(store) {
  if (!store || state.storeIcons.length === 0) return "";
  if (iconCache.list !== state.storeIcons) iconCache = { list: state.storeIcons, map: new Map() };
  if (iconCache.map.has(store)) return iconCache.map.get(store);
  const key = storeKey(store);
  const hit = state.storeIcons
    .filter((r) => r.keyword && r.icon && key.includes(storeKey(r.keyword)))
    .sort((a, b) => storeKey(b.keyword).length - storeKey(a.keyword).length)
    .at(0);
  const icon = hit ? hit.icon : "";
  iconCache.map.set(store, icon);
  return icon;
}

// 登録した名前に当てはまるお店の名前（重複なし）
export function storesMatching(keyword) {
  const k = storeKey(keyword);
  if (!k) return [];
  const names = new Set();
  state.transactions.forEach((t) => !t.deleted && t.store && storeKey(t.store).includes(k) && names.add(t.store));
  state.fixedCosts.forEach((f) => f.name && storeKey(f.name).includes(k) && names.add(f.name));
  return [...names];
}
