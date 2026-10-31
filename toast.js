// ===== 画面下に短く出るお知らせ =====
let el = null;
let timer = null;

export function toast(text, isError = false) {
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.toggle("is-error", isError);
  el.classList.remove("is-show");
  void el.offsetWidth;
  el.classList.add("is-show");
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove("is-show"), 2400);
}
