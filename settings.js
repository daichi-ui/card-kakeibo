// ===== 設定 =====
//   サブスク（毎月の固定費）・カテゴリ・アカウント
import { auth } from "./firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { state, subscribe, isActiveIn, unregisteredCategories, categoryColor, monthFixedTotal, storesMatching, storeKey } from "./store.js";
import { openSubSheet } from "./subs.js";
import { openCategorySheet, registerAll } from "./categories.js";
import { openStoreIconSheet } from "./storeicons.js";
import { itemIcon } from "./rows.js";
import { today, price, yen, formatMonth, escapeHtml } from "./utils.js";

const subsTotalEl = document.getElementById("subsTotal");
const subsListEl = document.getElementById("subsList");
const catListEl = document.getElementById("catList");
const catUnregEl = document.getElementById("catUnregistered");
const catErrorEl = document.getElementById("catError");
const storeListEl = document.getElementById("storeIconList");
const storeErrorEl = document.getElementById("storeIconError");
const storeSheet = document.getElementById("storeIconListSheet");
const storeSearchEl = document.getElementById("storeIconSearch");

const CHEVRON = `<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>`;

subscribe(render);

document.getElementById("subsAdd").addEventListener("click", () => openSubSheet());
document.getElementById("catAdd").addEventListener("click", () => openCategorySheet());
// お店のアイコンは、設定には1行だけ置き、タップで一覧のページを下から出す
document.getElementById("storeIconOpen").addEventListener("click", () => {
  storeSearchEl.value = "";
  renderStoreIcons();
  storeSheet.showModal();
});
document.getElementById("storeIconAdd").addEventListener("click", () => openStoreIconSheet());
storeSearchEl.addEventListener("input", () => renderStoreIcons());
storeListEl.addEventListener("click", (e) => {
  const b = e.target.closest("[data-store-icon]");
  if (b) openStoreIconSheet(b.dataset.storeIcon);
});
document.getElementById("logoutBtn").addEventListener("click", () => {
  if (confirm("ログアウトしますか？")) signOut(auth);
});

subsListEl.addEventListener("click", (e) => {
  const b = e.target.closest("[data-sub]");
  if (b) openSubSheet(b.dataset.sub);
});
catListEl.addEventListener("click", (e) => {
  const b = e.target.closest("[data-cat]");
  if (b) openCategorySheet(b.dataset.cat);
});
catUnregEl.addEventListener("click", (e) => {
  const one = e.target.closest("[data-unreg]");
  if (one) return openCategorySheet(null, one.dataset.unreg);
  if (e.target.closest("[data-unreg-all]")) registerAll(unregisteredCategories());
});

function render() {
  if (!state.user) return;
  document.getElementById("accountEmail").textContent = state.user.email || "";

  // ===== サブスク =====
  const month = today().slice(0, 7);
  const active = state.fixedCosts.filter((f) => isActiveIn(f, month));
  subsTotalEl.textContent = active.length ? `今月 ${yen(monthFixedTotal(month))}` : "";
  subsListEl.innerHTML = [...state.fixedCosts]
    .sort((a, b) => Number(!isActiveIn(a, month)) - Number(!isActiveIn(b, month)) || (a.day - b.day))
    .map((f) => {
      const ended = f.endMonth && f.endMonth < month;
      const sub = [
        f.day === 31 ? "月末" : `毎月${f.day}日`,
        ended ? `${formatMonth(f.endMonth)}で終了` : f.category || "未分類"
      ].join(" ・ ");
      return `
        <button type="button" class="cell ${ended ? "is-dim" : ""}" data-sub="${escapeHtml(f.id)}">
          ${itemIcon(f.category, f.icon, f.name)}
          <span class="cell-text"><span class="cell-title">${escapeHtml(f.name)}</span><span class="cell-sub">${escapeHtml(sub)}</span></span>
          <span class="cell-value">${price(f.amount, "s")}</span>${CHEVRON}
        </button>`;
    }).join("");

  // ===== お店のアイコン（設定の1行：登録数と、先頭のいくつかを重ねて見せる） =====
  const icons = sortedStoreIcons();
  document.getElementById("storeIconSummary").textContent =
    icons.length ? `${icons.length}件` : "まだありません";
  document.getElementById("storeIconStack").innerHTML = icons.length
    ? icons.slice(0, 3).map((r) => `<img src="${escapeHtml(r.icon)}" alt="">`).join("")
    : `<span class="add-icon">＋</span>`;
  renderStoreIcons();

  // ===== カテゴリ =====
  catErrorEl.hidden = !state.categoryError;
  catErrorEl.textContent = state.categoryError || "";
  catListEl.innerHTML = [...state.categories]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "ja"))
    .map((c) => `
      <button type="button" class="cell" data-cat="${escapeHtml(c.id)}">
        <span class="dot dot-l" style="--c:${categoryColor(c.name)}"></span>
        <span class="cell-text"><span class="cell-title">${escapeHtml(c.name)}</span></span>
        ${CHEVRON}
      </button>`).join("");

  const unreg = unregisteredCategories();
  catUnregEl.hidden = unreg.length === 0;
  catUnregEl.innerHTML = unreg.length ? `
    <span class="chips-label">使用中で未登録</span>
    ${unreg.map((c) => `<button type="button" class="chip" data-unreg="${escapeHtml(c)}">＋ ${escapeHtml(c)}</button>`).join("")}
    ${unreg.length > 1 ? `<button type="button" class="chip chip-strong" data-unreg-all>すべて追加</button>` : ""}` : "";
}

function sortedStoreIcons() {
  return [...state.storeIcons].sort((a, b) => a.keyword.localeCompare(b.keyword, "ja"));
}

// ===== お店のアイコンの一覧（下から出るページ） =====
function renderStoreIcons() {
  storeErrorEl.hidden = !state.storeIconError;
  storeErrorEl.textContent = state.storeIconError || "";
  const all = sortedStoreIcons();
  const q = storeKey(storeSearchEl.value);
  const list = q ? all.filter((r) => storeKey(r.keyword).includes(q)) : all;
  // 少ないうちは検索を出さない
  document.getElementById("storeIconSearchWrap").hidden = all.length < 8;
  storeListEl.innerHTML = list.length
    ? list.map((r) => `
        <button type="button" class="icon-tile" data-store-icon="${escapeHtml(r.id)}">
          <img src="${escapeHtml(r.icon)}" alt="">
          <span class="icon-tile-name">${escapeHtml(r.keyword)}</span>
          <span class="icon-tile-count">${storesMatching(r.keyword).length}件</span>
        </button>`).join("")
    : `<p class="empty">${all.length ? "見つかりませんでした" : "右上の「追加」から登録できます"}</p>`;
}
