// ===== レポート =====
//   「月」「年」で集計期間を切り替え、矢印かスワイプで前後に移動
//   円グラフ：カテゴリ別の内訳 / 縦棒グラフ：月ごとの推移
import { state, subscribe, monthItems, yearItems, monthTotal, sum, categoryTotals } from "./store.js";
import { today, addMonth, yen, signedYen, price, formatMonth, escapeHtml, swipe } from "./utils.js";

const periodEl = document.getElementById("reportPeriod");
const modeEl = document.getElementById("reportMode");
const summaryEl = document.getElementById("reportSummary");
const pieEl = document.getElementById("reportPie");
const legendEl = document.getElementById("reportLegend");
const barTitleEl = document.getElementById("reportBarTitle");
const barEl = document.getElementById("reportBar");
const pagerEl = document.getElementById("reportPager");

// 円グラフの色（多い順に使う。8番目以降は「その他」にまとめる）
const COLORS = ["#0071E3", "#34C759", "#FF9F0A", "#FF375F", "#AF52DE", "#5AC8FA", "#FFCC00"];
const OTHER_COLOR = "#C7C7CC";

let mode = "month";                 // "month" | "year"
let month = today().slice(0, 7);    // 月単位で表示中の月
let year = today().slice(0, 4);     // 年単位で表示中の年

subscribe(render);

modeEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-mode]");
  if (!btn) return;
  mode = btn.dataset.mode;
  if (mode === "year") year = month.slice(0, 4);
  render();
});
document.getElementById("reportPrev").addEventListener("click", () => move(-1));
document.getElementById("reportNext").addEventListener("click", () => move(1));
swipe(pagerEl, move);

function move(dir) {
  if (mode === "month") month = addMonth(month, dir);
  else year = String(Number(year) + dir);
  render();
}

// 棒をタップ：その月を月単位で表示
barEl.addEventListener("click", (e) => {
  const bar = e.target.closest("[data-month]");
  if (!bar) return;
  month = bar.dataset.month;
  mode = "month";
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
  modeEl.querySelectorAll("[data-mode]").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.mode === mode);
    b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  });
  periodEl.textContent = mode === "month" ? formatMonth(month) : `${year}年`;
  if (!state.user) {
    summaryEl.innerHTML = pieEl.innerHTML = legendEl.innerHTML = barEl.innerHTML = "";
    return;
  }

  // ===== 合計と前の期間との比較 =====
  const items = mode === "month" ? monthItems(month) : yearItems(year);
  const total = sum(items);
  const prevTotal = mode === "month" ? monthTotal(addMonth(month, -1)) : sum(yearItems(String(Number(year) - 1)));
  const diff = total - prevTotal;
  summaryEl.innerHTML = `
    <span class="summary-label">${mode === "month" ? formatMonth(month) : `${year}年`}の合計</span>
    <span class="summary-amount">${price(total, "xl")}</span>
    <span class="summary-meta">
      <span class="${diff > 0 ? "is-up" : diff < 0 ? "is-down" : ""}">${mode === "month" ? "前月" : "前年"}比 ${signedYen(diff)}</span>
      ${mode === "year" ? `<span>月平均 ${yen(total / 12)}</span>` : ""}
    </span>`;

  renderPie(categoryTotals(items), total);
  renderBar();
}

// ===== 円グラフ（ドーナツ型） =====
function renderPie(rows, total) {
  if (!rows.length || total <= 0) {
    pieEl.innerHTML = "";
    legendEl.innerHTML = `<p class="empty">この期間の利用はありません</p>`;
    return;
  }
  // マイナス（返金が多いカテゴリ）は円グラフに入れない
  const positive = rows.filter(([, v]) => v > 0);
  const top = positive.slice(0, COLORS.length);
  const rest = positive.slice(COLORS.length).reduce((s, [, v]) => s + v, 0);
  const slices = top.map(([c, v], i) => ({ c, v, color: COLORS.at(i) }));
  if (rest > 0) slices.push({ c: "その他", v: rest, color: OTHER_COLOR });
  const pieTotal = slices.reduce((s, x) => s + x.v, 0);

  const R = 70, C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = slices.map((s) => {
    const len = (s.v / pieTotal) * C;
    const arc = `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${s.color}" stroke-width="34"
      stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}"/>`;
    offset += len;
    return arc;
  }).join("");

  pieEl.innerHTML = `
    <svg viewBox="0 0 200 200" class="pie" role="img" aria-label="カテゴリ別の内訳">
      <g transform="rotate(-90 100 100)">${arcs}</g>
      <text x="100" y="94" text-anchor="middle" class="pie-label">合計</text>
      <text x="100" y="116" text-anchor="middle" class="pie-value">${escapeHtml(yen(total))}</text>
    </svg>`;

  legendEl.innerHTML = rows.map(([cat, v]) => {
    const slice = slices.find((s) => s.c === cat);
    const color = slice ? slice.color : OTHER_COLOR;
    const pct = total ? Math.round((v / total) * 100) : 0;
    return `
      <div class="legend-row">
        <span class="legend-dot" style="background:${color}"></span>
        <span class="legend-name">${escapeHtml(cat)}</span>
        <span class="legend-pct">${pct}%</span>
        <span class="legend-amount">${price(v, "s")}</span>
      </div>`;
  }).join("");
}

// ===== 縦棒グラフ（月ごとの推移） =====
// 月単位：選んだ月までの12か月 / 年単位：その年の1〜12月
function renderBar() {
  const months = mode === "month"
    ? Array.from({ length: 12 }, (_, i) => addMonth(month, i - 11))
    : Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  barTitleEl.textContent = mode === "month" ? "直近12か月の推移" : `${year}年の月別推移`;

  const totals = months.map((m) => monthTotal(m));
  const max = niceMax(Math.max(...totals));
  const W = 340, H = 200, left = 34, right = 6, top = 24, bottom = 26;
  const plotW = W - left - right, plotH = H - top - bottom;
  const slot = plotW / months.length, barW = Math.min(16, slot * 0.56);
  const y = (v) => top + plotH - (Math.max(v, 0) / max) * plotH;
  const thisMonth = today().slice(0, 7);

  const grid = [0, 0.5, 1].map((r) => {
    const v = max * r;
    return `<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/>
            <text x="${left - 6}" y="${y(v) + 3.5}" text-anchor="end" class="chart-axis">${shortYen(v)}</text>`;
  }).join("");

  const bars = months.map((m, i) => {
    const v = totals.at(i);
    const cx = left + slot * i + slot / 2;
    const h = Math.max(v > 0 ? 3 : 0, top + plotH - y(v));
    const isSel = mode === "month" && m === month;
    const label = Number(m.slice(5, 7));
    return `
      <g data-month="${m}" class="chart-bar ${isSel ? "is-selected" : ""} ${m > thisMonth ? "is-future" : ""}">
        <rect x="${left + slot * i}" y="${top}" width="${slot}" height="${plotH + bottom}" fill="transparent"/>
        <rect x="${cx - barW / 2}" y="${top + plotH - h}" width="${barW}" height="${h}" rx="4"/>
        <text x="${cx}" y="${H - 8}" text-anchor="middle" class="chart-axis ${isSel ? "is-strong" : ""}">${label === 1 && mode === "month" ? `${m.slice(2, 4)}/1` : label}</text>
        ${isSel ? `<text x="${Math.min(Math.max(cx, left + 26), W - 30)}" y="${y(v) - 8}" text-anchor="middle" class="chart-value">${yen(v)}</text>` : ""}
      </g>`;
  }).join("");

  barEl.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${barTitleEl.textContent}">
      ${grid}${bars}
    </svg>`;
}
