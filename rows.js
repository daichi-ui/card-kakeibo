// ===== 一覧の1行（ホーム・明細で共通） =====
//   左：カテゴリの色のアイコン / 中：お店と補足 / 右：金額
//   タップで編集、左にスワイプで「除外」ボタン
import { price, formatDayWeek, escapeHtml, normalizeCategory } from "./utils.js";
import { openItem, toggleExcluded } from "./editor.js";
import { state, monthItems, categoryColor } from "./store.js";

// カテゴリの頭文字を色付きの丸に入れる
export function categoryIcon(category, size = "m") {
  const c = normalizeCategory(category);
  const color = categoryColor(c);
  const letter = c === "未分類" ? "・" : [...c].at(0);
  return `<span class="cat-icon cat-icon-${size}" style="--c:${color}">${escapeHtml(letter)}</span>`;
}

// item：store.js の monthItems() の行、または利用データ
//   showDate … 日付も表示する
export function rowHtml(item, { showDate = false } = {}) {
  const type = item.type || "tx";
  const month = item.month || (item.date || "").slice(0, 7);
  const data = `data-type="${type}" data-id="${escapeHtml(item.id)}" data-month="${month}"`;

  const sub = [
    showDate ? formatDayWeek(item.date) : item.time,
    normalizeCategory(item.category),
    type === "fixed" ? "サブスク" : ""
  ].filter(Boolean).join(" ・ ");

  // バッジは注意が必要なものだけ
  const badge = item.needsReview
    ? `<span class="badge badge-review">要確認</span>`
    : item.excluded ? `<span class="badge badge-off">除外</span>` : "";

  return `
    <div class="row ${item.excluded ? "is-excluded" : ""}" ${data}>
      <button type="button" class="row-action" data-action="toggle" tabindex="-1">
        ${item.excluded ? "戻す" : "除外"}
      </button>
      <button type="button" class="row-main" data-action="open">
        ${categoryIcon(item.category)}
        <span class="row-text">
          <span class="row-title">${escapeHtml(item.store || "（お店不明）")}</span>
          <span class="row-sub">${badge}${escapeHtml(sub)}</span>
        </span>
        <span class="row-amount">${price(item.amount, "m")}</span>
      </button>
    </div>`;
}

function findItem(row) {
  if (row.dataset.type === "fixed") {
    return monthItems(row.dataset.month).find((i) => i.type === "fixed" && i.id === row.dataset.id);
  }
  const t = state.transactions.find((x) => x.id === row.dataset.id);
  return t ? { type: "tx", ...t, excluded: !!t.excluded } : null;
}

// ===== スワイプ =====
const OPEN_X = -84;   // 開いたときのずれ（ボタンの幅）
let openRow = null;   // 開いている行（同時に開くのは1行だけ）

function setOffset(row, x, animate) {
  const main = row.querySelector(".row-main");
  main.style.transition = animate ? "" : "none";
  main.style.transform = x ? `translateX(${x}px)` : "";
  row.classList.toggle("is-open", x !== 0);
}

export function closeOpenRow() {
  if (openRow) setOffset(openRow, 0, true);
  openRow = null;
}

document.addEventListener("pointerdown", (e) => {
  if (openRow && !openRow.contains(e.target)) closeOpenRow();
}, true);

// 一覧のタップとスワイプをまとめて受け付ける
export function bindRows(container) {
  let drag = null;   // { row, x0, y0, base, dx, moved, horizontal }

  container.addEventListener("pointerdown", (e) => {
    const main = e.target.closest(".row-main");
    if (!main || !container.contains(main) || e.button > 0) return;
    const row = main.closest(".row");
    drag = { row, x0: e.clientX, y0: e.clientY, base: row === openRow ? OPEN_X : 0, dx: 0, moved: false, horizontal: null };
  });

  container.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (drag.horizontal === null && Math.hypot(dx, dy) > 8) drag.horizontal = Math.abs(dx) > Math.abs(dy);
    if (!drag.horizontal) return;
    drag.moved = true;
    drag.dx = dx;
    const x = Math.min(0, Math.max(OPEN_X * 1.4, drag.base + dx));
    setOffset(drag.row, x, false);
  });

  const end = () => {
    if (!drag) return;
    const { row, moved, base, dx } = drag;
    drag = null;
    if (!moved) return;
    const open = base + dx < OPEN_X / 2;
    if (open) {
      if (openRow && openRow !== row) setOffset(openRow, 0, true);
      setOffset(row, OPEN_X, true);
      openRow = row;
    } else {
      setOffset(row, 0, true);
      if (openRow === row) openRow = null;
    }
    // スワイプのあとのクリックで編集画面が開かないようにする
    row.dataset.swiped = "1";
    setTimeout(() => { delete row.dataset.swiped; }, 50);
  };
  container.addEventListener("pointerup", end);
  container.addEventListener("pointercancel", end);

  container.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || !container.contains(el)) return;
    const row = el.closest(".row");
    if (row.dataset.swiped) return;
    const item = findItem(row);
    if (!item) return;
    if (el.dataset.action === "toggle") {
      closeOpenRow();
      toggleExcluded(item);
    } else if (row === openRow) {
      closeOpenRow();
    } else {
      openItem(item);
    }
  });
}
