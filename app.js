import { auth } from "./firebase.js";
import { initStore, stopStore, subscribe, state, knownCategories } from "./store.js";
import "./home.js";
import "./list.js";
import "./report.js";
import { openFixedSettings } from "./fixed.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { escapeHtml } from "./utils.js";

// ===== 画面の要素 =====
const loading = document.getElementById("loading");
const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginError = document.getElementById("loginError");
const pageTitle = document.getElementById("pageTitle");
const accountSheet = document.getElementById("accountSheet");
const dataError = document.getElementById("dataError");

// ===== ログイン状態で画面を切り替え =====
onAuthStateChanged(auth, (user) => {
  loading.hidden = true;
  if (user) {
    loginView.hidden = true;
    appView.hidden = false;
    setAccount(user);
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

// データの読み込みエラー（許可されていないアカウントなど）と、カテゴリの入力候補
subscribe(() => {
  dataError.hidden = !state.error;
  dataError.textContent = state.error || "";
  document.getElementById("categoryList").innerHTML =
    knownCategories().map((c) => `<option value="${escapeHtml(c)}"></option>`).join("");
});

// ===== アカウントボタン（右上の丸いアイコン） =====
function setAccount(user) {
  const img = document.getElementById("avatarImg");
  const name = user.displayName || user.email || "?";
  document.getElementById("avatarText").textContent = name.trim().charAt(0).toUpperCase();
  document.getElementById("accountEmail").textContent = user.email || "";
  if (user.photoURL) {
    img.src = user.photoURL;
    img.hidden = false;
    img.onerror = () => { img.hidden = true; };
  } else {
    img.hidden = true;
  }
}

document.getElementById("accountBtn").addEventListener("click", () => accountSheet.showModal());
document.getElementById("accountCancel").addEventListener("click", () => accountSheet.close());
document.getElementById("openFixedBtn").addEventListener("click", () => {
  accountSheet.close();
  openFixedSettings();
});
document.getElementById("logoutBtn").addEventListener("click", () => {
  accountSheet.close();
  signOut(auth);
});

// ===== 下から出る画面の共通処理 =====
// 「キャンセル」「閉じる」ボタンと、背景のタップで閉じる
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog || e.target.closest("[data-close]")) dialog.close();
  });
});

// ===== タブ切り替え =====
const TABS = ["home", "list", "report"];

export function showTab(name) {
  if (!TABS.includes(name)) name = "home";
  document.querySelectorAll(".page").forEach((page) => {
    page.hidden = page.id !== `tab-${name}`;
  });
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === name);
  });
  pageTitle.textContent = document.getElementById(`tab-${name}`).dataset.title;
  history.replaceState(null, "", `#${name}`);
  window.scrollTo(0, 0);
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => showTab(btn.dataset.tab));
});
