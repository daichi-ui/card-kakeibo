// ===== レポート（月ごとの推移とカテゴリ別の内訳） =====
import { state, subscribe, monthItems, countable, monthTotal } from "./store.js";
import { today, addMonth, yen, price, formatMonth, escapeHtml } from "./utils.js";

const chartEl = document.getElementById("reportChart");
const catTitleEl = document.getElementById("reportCatTitle");
const catsEl = document.getElementById("reportCats");

const MONTHS = 12;               // 何か月分を表示するか
let selected = today().slice(0, 7);

subscribe(render);

chartEl.addEventListener("click", (e) => {
  const bar = e.target.closest("[data-month]");
  if (!bar) return;
  selected = bar.dataset.month;
  render();
});

// 軸のきりのいい最大値（例：37,000 → 40,000）
function niceMax(v) {
  if (v <= 0) return 10000;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * p;
}

// 10000 → "1万"、5000 → "5千"
function shortYen(v) {
  if (v === 0) return "0";
  if (v >= 10000) return `${Number((v / 10000).toFixed(1))}万`;
  return `${Number((v / 1000).toFixed(1))}千`;
}

function render() {
  if (!state.user) {
    chartEl.innerHTML = "";
    catsEl.innerHTML = "";
    return;
  }

  const thisMonth = today().slice(0, 7);
  const months = Array.from({ length: MONTHS }, (_, i) => addMonth(thisMonth, i - (MONTHS - 1)));
  const totals = months.map((m) => monthTotal(m));
  const max = niceMax(Math.max(...totals));

  // ===== 棒グラフ =====
  const W = 340, H = 190, left = 34, right = 6, top = 22, bottom = 26;
  const plotW = W - left - right, plotH = H - top - bottom;
  const slot = plotW / MONTHS, barW = Math.min(18, slot * 0.6);
  const y = (v) => top + plotH - (v / max) * plotH;

  const grid = [0, 0.5, 1].map((r) => {
    const v = max * r;
    return `<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/>
            <text x="${left - 6}" y="${y(v) + 3.5}" text-anchor="end" class="chart-axis">${shortYen(v)}</text>`;
  }).join("");

  const bars = months.map((m, i) => {
    const v = totals.at(i);
    const cx = left + slot * i + slot / 2;
    const h = Math.max(v > 0 ? 2 : 0, top + plotH - y(v));
    const isSel = m === selected;
    const label = Number(m.slice(5, 7));
    return `
      <g data-month="${m}" class="chart-bar ${isSel ? "is-selected" : ""}">
        <rect x="${left + slot * i}" y="${top}" width="${slot}" height="${plotH + bottom}" fill="transparent"/>
        <rect x="${cx - barW / 2}" y="${top + plotH - h}" width="${barW}" height="${h}" rx="3"/>
        <text x="${cx}" y="${H - 8}" text-anchor="middle" class="chart-axis ${isSel ? "is-strong" : ""}">${label === 1 ? `${m.slice(2, 4)}/1` : label}</text>
        ${isSel ? `<text x="${Math.min(Math.max(cx, left + 24), W - 28)}" y="${y(v) - 7}" text-anchor="middle" class="chart-value">${yen(v)}</text>` : ""}
      </g>`;
  }).join("");

  chartEl.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="月ごとの利用額（直近${MONTHS}か月）">
      ${grid}${bars}
    </svg>`;

  // ===== カテゴリ別の内訳 =====
  const items = countable(monthItems(selected));
  const total = items.reduce((s, i) => s + Number(i.amount), 0);
  catTitleEl.textContent = `${formatMonth(selected)}のカテゴリ別（${yen(total)}）`;

  const byCat = {};
  items.forEach((i) => {
    const c = i.category || "未分類";
    byCat[c] = (byCat[c] || 0) + Number(i.amount);
  });
  const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  catsEl.innerHTML = rows.length
    ? rows.map(([cat, sum]) => {
        const pct = total ? Math.round((sum / total) * 100) : 0;
        return `
          <div class="item cat-row">
            <div class="item-head">
              <span class="tx-store">${escapeHtml(cat)}</span>
              <span class="item-amount">${price(sum, "m")}</span>
            </div>
            <div class="cat-bar"><span style="width:${pct}%"></span></div>
            <div class="item-sub">${pct}%</div>
          </div>`;
      }).join("")
    : `<p class="empty">この月の利用はありません</p>`;
}
