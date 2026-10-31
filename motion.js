// ===== 動き =====
// 動きを減らす設定の端末では、すぐに最終の状態にする
export const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 数字をカウントアップ（またはダウン）させる
export function animateNumber(el, from, to, duration = 700) {
  if (!el) return;
  const fmt = (v) => (v < 0 ? "−" : "") + Math.abs(Math.round(v)).toLocaleString("ja-JP");
  if (reduceMotion() || from === to) {
    el.textContent = fmt(to);
    return;
  }
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 4);
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = fmt(from + (to - from) * ease(t));
    if (t < 1 && el.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// シートを下にドラッグして閉じる（上のつまみ・見出しのあたりをつかむ）
export function draggableSheet(dialog) {
  const handle = dialog.querySelector(".sheet-grabber, .sheet-bar, .quick-head");
  if (!handle) return;
  let y0 = null, dy = 0;
  handle.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, input, select")) return;
    y0 = e.clientY;
    dy = 0;
    dialog.style.transition = "none";
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    dialog.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (y0 === null) return;
    y0 = null;
    dialog.style.transition = "";
    if (dy > 110) {
      dialog.classList.add("is-closing");
      dialog.style.transform = "";
      setTimeout(() => { dialog.close(); dialog.classList.remove("is-closing"); }, 220);
    } else {
      dialog.style.transform = "";
    }
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}
