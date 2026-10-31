import { auth } from "./firebase.js";
import { initStore, stopStore, subscribe, state } from "./store.js";
import "./home.js";
import { addDate } from "./list.js";
import "./report.js";
import "./settings.js";
import { openTxNew } from "./editor.js";
import { closeOpenRow } from "./rows.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ===== 画面の要素 =====
const loading = document.getElementById("loading");
const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginError = document.getElementById("loginError");
const pageTitle = document.getElementById("pageTitle");
const barTitle = document.getElementById("barTitle");
const header = document.getElementById("navbar");
const dataError = document.getElementById("dataError");
const fab = document.getElementById("fab");

// ===== ログイン状態で画面を切り替え =====
onAuthStateChanged(auth, (user) => {
  loading.hidden = true;
  if (user) {
    loginView.hidden = true;
    appView.hidden = false;
    showTab(location.hash.replace("#", "") || "home");
    initStore(user);
  } else {
    stopStore();
    appView.hidden = true;
    loginView.hidden = false;
  }
});

document.getElementById("loginBtn").addEventListener("click", async () => {
  loginError.textContent = "";
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    loginError.textContent = "ログインに失敗しました：" + e.message;
  }
});

// データの読み込みエラー（許可されていないアカウントなど）
subscribe(() => {
  dataError.hidden = !state.error;
  dataError.textContent = state.error || "";
});

// ===== 下から出る画面の共通処理 =====
// 「キャンセル」「閉じる」ボタンと、背景のタップで閉じる
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog || e.target.closest("[data-close]")) dialog.close();
  });
});

// ===== タブ切り替え =====
const TABS = ["home", "list", "report", "settings"];
let current = "home";

export function showTab(name) {
  if (!TABS.includes(name)) name = "home";
  current = name;
  closeOpenRow();
  document.querySelectorAll(".page").forEach((page) => {
    page.hidden = page.id !== `tab-${name}`;
  });
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === name);
  });
  const title = document.getElementById(`tab-${name}`).dataset.title;
  pageTitle.textContent = title;
  barTitle.textContent = title;
  // ＋ボタンはホームと明細だけ
  fab.hidden = !(name === "home" || name === "list");
  history.replaceState(null, "", `#${name}`);
  window.scrollTo(0, 0);
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => showTab(btn.dataset.tab));
});

// ホームのカードなどから、指定のタブを開く（月の切り替えは各画面が行う）
window.addEventListener("open-month", (e) => showTab(e.detail.tab));

// ===== ＋ボタン（手入力で追加） =====
fab.addEventListener("click", () => openTxNew(current === "list" ? addDate() : undefined));

// ===== ヘッダー =====
// 大きな画面名の上に今日の日付。スクロールすると上のバーに小さな画面名が出る
document.getElementById("todayLabel").textContent =
  new Date().toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "long" });
const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 44);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();
