import { auth } from "./firebase.js";
import { initStore, stopStore, subscribe, notify, state } from "./store.js";
import "./home.js";
import { addDate } from "./list.js";
import "./report.js";
import "./settings.js";
import { openQuickAdd } from "./quickadd.js";
import { draggableSheet } from "./motion.js";
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
// 開いたときにブラウザが最初のボタン（キャンセル）にフォーカスして枠が付くので、
// 画面全体にフォーカスを移す（キーボードの操作はそのまま使える）
const showModal = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.showModal = function () {
  showModal.call(this);
  this.focus({ preventScroll: true });
};

// 「キャンセル」「閉じる」ボタンと、背景のタップで閉じる
// 下にドラッグしても閉じる。閉じるときは下へすべらせてから閉じる
function closeSheet(dialog) {
  if (!dialog.open || dialog.classList.contains("is-closing")) return;
  dialog.classList.add("is-closing");
  setTimeout(() => { dialog.close(); dialog.classList.remove("is-closing"); }, 220);
}
// 背景（シートの外）を押したか。シートの余白を押したときも target は dialog になるので、位置で判定する
function isBackdropClick(dialog, e) {
  if (e.target !== dialog) return false;
  const r = dialog.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (e) => {
    if (isBackdropClick(dialog, e) || e.target.closest("[data-close]")) closeSheet(dialog);
  });
  dialog.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(dialog); });
  draggableSheet(dialog);
});

// ===== タブ切り替え =====
const TABS = ["home", "list", "report", "settings"];
let current = null;

export function showTab(name) {
  if (!TABS.includes(name)) name = "home";
  const changed = name !== current;
  current = name;
  closeOpenRow();
  document.querySelectorAll(".page").forEach((page) => {
    const show = page.id === `tab-${name}`;
    page.hidden = !show;
    // 開いた画面はふわっと出す
    if (show && changed) {
      page.classList.remove("page-enter");
      void page.offsetWidth;
      page.classList.add("page-enter");
    }
  });
  document.querySelectorAll(".tab").forEach((btn, i) => {
    const on = btn.dataset.tab === name;
    btn.classList.toggle("active", on);
    if (on) document.querySelector(".tabbar").style.setProperty("--tab", i);
  });
  const title = document.getElementById(`tab-${name}`).dataset.title;
  pageTitle.textContent = title;
  barTitle.textContent = title;
  // ＋ボタンはホームと明細だけ
  fab.hidden = !(name === "home" || name === "list");
  fab.classList.remove("is-away");
  history.replaceState(null, "", `#${name}`);
  window.scrollTo(0, 0);
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => showTab(btn.dataset.tab));
});

// ホームのカードなどから、指定のタブを開く（月の切り替えは各画面が行う）
window.addEventListener("open-month", (e) => showTab(e.detail.tab));

// ===== ＋ボタン（手入力で追加） =====
fab.addEventListener("click", () => openQuickAdd(current === "list" ? addDate() : undefined));

// ===== ヘッダー =====
// 大きな画面名の上に今日の日付。スクロールすると上のバーに小さな画面名が出る
let shownDay = "";
function updateToday() {
  const d = new Date();
  const key = d.toDateString();
  if (key === shownDay) return;
  const first = !shownDay;
  shownDay = key;
  document.getElementById("todayLabel").textContent =
    d.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "long" });
  // ホーム画面に追加して開いたままにしていると日付が変わっても描き直されないので、
  // 戻ってきたときに日付が変わっていれば、次のお支払い・カレンダーの「今日」などを描き直す
  if (!first && state.user) notify();
}
updateToday();
document.addEventListener("visibilitychange", () => { if (!document.hidden) updateToday(); });
setInterval(updateToday, 60 * 1000);

// 下へスクロールしている間は＋ボタンを隠し、一覧の金額を隠さないようにする（上へ戻すとまた出る）
let lastY = window.scrollY;
const onScroll = () => {
  const y = window.scrollY;
  header.classList.toggle("is-scrolled", y > 44);
  if (Math.abs(y - lastY) > 6) {
    fab.classList.toggle("is-away", y > lastY && y > 80);
    lastY = y;
  }
};
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();
