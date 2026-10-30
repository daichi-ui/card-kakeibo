// ===== 一覧の1行（ホーム・明細で共通） =====
import { yen, formatDayWeek, escapeHtml } from "./utils.js";
import { openItem } from "./editor.js";
import { state, monthItems } from "./store.js";

// item：store.js の monthItems() の行、または利用データ
export function rowHtml(item, { showDate = false } = {}) {
  const badges = [];
  if (item.type === "fixed") badges.push(`<span class="badge badge-fixed">固定費</span>`);
  if (item.source === "manual") badges.push(`<span class="badge badge-manual">手入力</span>`);
  if (item.needsReview) badges.push(`<span class="badge badge-review">要確認</span>`);
  if (item.skipped) badges.push(`<span class="badge badge-skip">この月は削除</span>`);
  if (item.changed) badges.push(`<span class="badge badge-manual">この月だけ変更</span>`);

  const sub = [
    showDate ? formatDayWeek(item.date) : "",
    item.time || "",
    item.kind || "",
    item.category && item.category !== "未分類" ? item.category : ""
  ].filter(Boolean).join(" ・ ");

  return `
    <button type="button" class="item item-button tx-row ${item.skipped ? "is-skipped" : ""}"
            data-type="${item.type || "tx"}" data-id="${item.id}" data-month="${item.month || ""}">
      <div class="item-head">
        <span class="tx-store">${escapeHtml(item.store || "（お店不明）")}</span>
        <span class="item-amount">${yen(item.amount)}</span>
      </div>
      ${sub || badges.length ? `<div class="item-sub">${badges.join("")}${escapeHtml(sub)}</div>` : ""}
      ${item.memo ? `<div class="item-memo">${escapeHtml(item.memo)}</div>` : ""}
    </button>`;
}

// 一覧の行をタップしたら、編集画面を開く
export function bindRows(container) {
  container.addEventListener("click", (e) => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    if (row.dataset.type === "fixed") {
      const item = monthItems(row.dataset.month).find((i) => i.type === "fixed" && i.id === row.dataset.id);
      if (item) openItem(item);
    } else {
      const t = state.transactions.find((x) => x.id === row.dataset.id);
      if (t) openItem({ type: "tx", ...t });
    }
  });
}
