// ===== 一覧の1行（ホーム・カレンダー・サブスク・明細で共通） =====
import { price, formatDayWeek, escapeHtml } from "./utils.js";
import { openItem, toggleExcluded } from "./editor.js";
import { state, monthItems } from "./store.js";

const ICON_EXCLUDE = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>`;
const ICON_INCLUDE = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>`;

// item：store.js の monthItems() の行、または利用データ
//   showDate   … 日付も表示する
//   toggle     … 「計算から除外」の切り替えボタンを付ける
export function rowHtml(item, { showDate = false, toggle = false } = {}) {
  const badges = [];
  if (item.type === "fixed") badges.push(`<span class="badge badge-fixed">サブスク</span>`);
  if (item.source === "mail") badges.push(`<span class="badge badge-mail">Gmail</span>`);
  if (item.source === "manual") badges.push(`<span class="badge badge-manual">手入力</span>`);
  if (item.needsReview) badges.push(`<span class="badge badge-review">要確認</span>`);
  if (item.kind === "取消" || Number(item.amount) < 0) badges.push(`<span class="badge badge-cancel">取消</span>`);
  if (item.changed) badges.push(`<span class="badge badge-manual">今月だけ変更</span>`);
  if (item.excluded) badges.push(`<span class="badge badge-off">計算から除外</span>`);

  const sub = [
    showDate ? formatDayWeek(item.date) : "",
    item.time || "",
    item.kind && item.kind !== "取消" ? item.kind : "",
    item.category && item.category !== "未分類" ? item.category : ""
  ].filter(Boolean).join(" ・ ");

  const type = item.type || "tx";
  const month = item.month || (item.date || "").slice(0, 7);
  const data = `data-type="${type}" data-id="${escapeHtml(item.id)}" data-month="${month}"`;

  return `
    <div class="row ${item.excluded ? "is-excluded" : ""}">
      <button type="button" class="row-main" ${data} data-action="open">
        <span class="row-head">
          <span class="row-title">${escapeHtml(item.store || "（お店不明）")}</span>
          <span class="row-amount">${price(item.amount, "m")}</span>
        </span>
        ${sub || badges.length ? `<span class="row-sub">${badges.join("")}<span>${escapeHtml(sub)}</span></span>` : ""}
        ${item.memo ? `<span class="row-memo">${escapeHtml(item.memo)}</span>` : ""}
      </button>
      ${toggle ? `
        <button type="button" class="row-toggle" ${data} data-action="toggle"
                aria-label="${item.excluded ? "計算に戻す" : "計算から除外"}" title="${item.excluded ? "計算に戻す" : "計算から除外"}">
          ${item.excluded ? ICON_INCLUDE : ICON_EXCLUDE}
        </button>` : ""}
    </div>`;
}

function findItem(el) {
  if (el.dataset.type === "fixed") {
    return monthItems(el.dataset.month).find((i) => i.type === "fixed" && i.id === el.dataset.id);
  }
  const t = state.transactions.find((x) => x.id === el.dataset.id);
  return t ? { type: "tx", ...t, excluded: !!t.excluded } : null;
}

// 一覧の行をタップしたら編集画面、丸いボタンなら除外の切り替え
export function bindRows(container) {
  container.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || !container.contains(el)) return;
    const item = findItem(el);
    if (!item) return;
    if (el.dataset.action === "toggle") toggleExcluded(item);
    else openItem(item);
  });
}
