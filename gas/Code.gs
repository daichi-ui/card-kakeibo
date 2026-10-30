/**
 * 三井住友カード「ご利用のお知らせ」メールを読み取り、Firestore に登録する
 *
 * 使い方（くわしくは README を参照）
 *   1. スクリプトのプロパティに SERVICE_ACCOUNT（Firebase の秘密鍵 JSON の中身）を登録
 *   2. setup() を1回だけ実行（10分ごとの自動実行を登録し、過去分も取り込む）
 */

const CONFIG = {
  projectId: "card-kakeibo",
  // 最初に取り込む日（この日以降のメールを対象にする）
  startDate: "2026/10/01",
  // 対象のメール
  query: 'from:statement@vpass.ne.jp subject:"ご利用のお知らせ"',
  // 何分ごとに実行するか（1, 5, 10, 15, 30 のどれか）
  intervalMinutes: 10
};

// ===== 最初に1回だけ実行する =====
function setup() {
  // 同じ処理の自動実行が残っていれば消す
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "syncCardMails")
    .forEach((t) => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger("syncCardMails")
    .timeBased()
    .everyMinutes(CONFIG.intervalMinutes)
    .create();

  // 過去分（startDate 以降）を取り込み直す
  PropertiesService.getScriptProperties().deleteProperty("LAST_SYNC_DATE");
  syncCardMails();
}

// ===== 自動で実行される本体 =====
function syncCardMails() {
  const props = PropertiesService.getScriptProperties();
  const since = props.getProperty("LAST_SYNC_DATE") || CONFIG.startDate;
  // Gmail の after: は時差でずれることがあるので、1日前から探す
  const sinceDate = parseSlashDate_(since);
  sinceDate.setDate(sinceDate.getDate() - 1);
  const query = `${CONFIG.query} after:${Utilities.formatDate(sinceDate, "Asia/Tokyo", "yyyy/MM/dd")}`;

  let added = 0;
  let skipped = 0;
  for (let start = 0; ; start += 100) {
    const threads = GmailApp.search(query, start, 100);
    if (threads.length === 0) break;

    threads.forEach((thread) => {
      thread.getMessages().forEach((msg) => {
        if (!/statement@vpass\.ne\.jp/i.test(msg.getFrom())) return;
        if (msg.getDate() < parseSlashDate_(CONFIG.startDate)) return;

        const parsed = parseCardMail(msg.getPlainBody());
        const ok = createTransaction_(msg.getId(), parsed, msg.getDate());
        ok ? added++ : skipped++;
      });
    });
    if (threads.length < 100) break;
  }

  // 次回は「2日前」から探す（取りこぼし防止。重複はメールIDで防いでいる）
  const d = new Date();
  d.setDate(d.getDate() - 2);
  props.setProperty("LAST_SYNC_DATE", Utilities.formatDate(d, "Asia/Tokyo", "yyyy/MM/dd"));

  console.log(`登録 ${added} 件 / 登録済みのためスキップ ${skipped} 件`);
}

// ===== メール本文の読み取り =====
// 例：
//   ご利用日時：2026/10/25 13:40
//   TICKETDIVE（買物）	1,180円
function parseCardMail(body) {
  const text = String(body).replace(/\r/g, "");
  const result = {
    date: null, time: null, store: null, kind: null, amount: null,
    needsReview: true, excerpt: ""
  };

  // 利用日時
  const dt = text.match(/ご利用日時[：:]\s*(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (!dt) return result;
  result.date = `${dt[1]}-${pad2_(dt[2])}-${pad2_(dt[3])}`;
  result.time = `${pad2_(dt[4])}:${dt[5]}`;

  // 利用日時の次にある、空でない行が「お店（種類）　金額円」
  const after = text.slice(dt.index + dt[0].length).split("\n")
    .map((l) => l.replace(/ /g, " ").trim())
    .filter((l) => l !== "");
  const line = after[0] || "";
  result.excerpt = line.slice(0, 200);

  const m = line.match(/^(.*?)\s*[\t ]+([\d,，]+)\s*円\s*$/);
  if (m) {
    let store = m[1].trim();
    const kind = store.match(/^(.*?)[（(]([^（）()]+)[）)]$/);
    if (kind) {
      store = kind[1].trim();
      result.kind = kind[2].trim();
    }
    result.store = store;
    result.amount = Number(m[2].replace(/[,，]/g, ""));
    result.needsReview = !(result.store && Number.isFinite(result.amount));
  } else {
    // 円以外の金額など、読み取れなかったもの → 要確認として残す
    result.store = line.replace(/[\t ]+[^\t ]+$/, "").trim() || "（読み取れませんでした）";
  }
  return result;
}

// ===== Firestore への登録 =====
// メールID をそのままデータの ID にする → 同じメールは2回登録されない
function createTransaction_(messageId, p, mailDate) {
  const fields = {
    date: str_(p.date || Utilities.formatDate(mailDate, "Asia/Tokyo", "yyyy-MM-dd")),
    time: str_(p.time || Utilities.formatDate(mailDate, "Asia/Tokyo", "HH:mm")),
    store: str_(p.store || "（読み取れませんでした）"),
    kind: str_(p.kind || ""),
    amount: p.amount === null ? { nullValue: null } : { integerValue: String(p.amount) },
    category: str_("未分類"),
    source: str_("mail"),
    needsReview: { booleanValue: !!p.needsReview },
    excerpt: str_(p.excerpt || ""),
    memo: str_(""),
    createdAt: { timestampValue: new Date().toISOString() }
  };

  const url = `https://firestore.googleapis.com/v1/projects/${CONFIG.projectId}` +
    `/databases/(default)/documents/transactions?documentId=${encodeURIComponent(messageId)}`;
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: `Bearer ${getAccessToken_()}` },
    payload: JSON.stringify({ fields }),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  if (code === 200) return true;
  if (code === 409) return false; // 登録済み
  throw new Error(`Firestore への登録に失敗しました（${code}）：${res.getContentText()}`);
}

// ===== Firebase の秘密鍵でアクセス用のトークンを作る =====
function getAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("firestore_token");
  if (cached) return cached;

  const json = PropertiesService.getScriptProperties().getProperty("SERVICE_ACCOUNT");
  if (!json) throw new Error("スクリプトのプロパティに SERVICE_ACCOUNT が登録されていません");
  const sa = JSON.parse(json);

  const now = Math.floor(Date.now() / 1000);
  const enc = (obj) => Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, "");
  const unsigned = enc({ alg: "RS256", typ: "JWT" }) + "." + enc({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  });
  const signature = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(unsigned, sa.private_key)
  ).replace(/=+$/, "");

  const res = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    payload: {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`
    }
  });
  const token = JSON.parse(res.getContentText()).access_token;
  cache.put("firestore_token", token, 3000); // 50分使い回す
  return token;
}

// ===== 動作確認用（実行しても登録はしない） =====
function testParseLatestMail() {
  const threads = GmailApp.search(CONFIG.query, 0, 1);
  if (threads.length === 0) return console.log("対象のメールが見つかりません");
  const msgs = threads[0].getMessages();
  const msg = msgs[msgs.length - 1];
  console.log(JSON.stringify(parseCardMail(msg.getPlainBody()), null, 2));
}

// ===== 小さな便利関数 =====
function str_(v) { return { stringValue: String(v) }; }
function pad2_(v) { return String(v).padStart(2, "0"); }
function parseSlashDate_(s) {
  const [y, m, d] = s.split("/").map(Number);
  return new Date(y, m - 1, d);
}
