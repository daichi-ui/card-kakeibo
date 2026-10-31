// ===== アイコン画像 =====
// 選んだ画像を 128px の正方形に切り抜いて縮め、data URL にする（数KB。Firestore にそのまま保存できる）
const ICON_SIZE = 128;

export async function resizeImage(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = ICON_SIZE;
  canvas.getContext("2d").drawImage(bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, ICON_SIZE, ICON_SIZE);
  const webp = canvas.toDataURL("image/webp", 0.85);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
}

// 画像を選ぶボタンの中身（画像があれば画像、なければ写真のマーク）
export function pickerHtml(icon) {
  return icon
    ? `<img src="${icon}" alt="">`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10.5" r="1.8"/><path d="M21 16l-5-5-8 8"/></svg>`;
}
