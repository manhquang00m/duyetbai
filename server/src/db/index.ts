import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from '../config';

// Tao thu muc data/ neu chua co
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;'); // ghi song song tot hon
db.exec('PRAGMA foreign_keys = ON;');

// Schema (chay moi lan mo, chi tao neu chua co)
db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    post_id     TEXT PRIMARY KEY,
    url         TEXT NOT NULL,
    username    TEXT,
    title       TEXT,
    caption     TEXT,
    likes       TEXT,
    comments    TEXT,
    views       TEXT,
    post_date    TEXT,
    scrape_error TEXT,
    scraped_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS media (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id  TEXT NOT NULL,
    type     TEXT NOT NULL,
    file     TEXT NOT NULL,
    ok       INTEGER NOT NULL,
    error    TEXT,
    FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS shopee_entries (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id  TEXT NOT NULL,
    comment  TEXT NOT NULL,
    link     TEXT NOT NULL,
    UNIQUE (post_id, comment, link),
    FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS proxies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    proxy       TEXT NOT NULL UNIQUE,
    status      TEXT,
    ip          TEXT,
    checked_at  TEXT,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS collect_history (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    url          TEXT NOT NULL UNIQUE,
    post_id      TEXT,
    ok           INTEGER NOT NULL,
    skipped      INTEGER NOT NULL DEFAULT 0,
    error        TEXT,
    attempted_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- (Bang account_topics cu da bi thay bang cot posts.topic - xem migration ben duoi. 1 tac gia
  -- co the dang o nhieu chu de khac nhau, nhung TUNG BAI chi thuoc DUNG 1 chu de.)

  -- Chu de cua ACCOUNT DANG BAI (accounts.id), nhieu-nhieu: 1 account nhan duoc nhieu chu de.
  -- KHAC HAN posts.topic o tren (gan theo TUNG BAI, tu tac gia bai cao ve). Hai tap ten nay roi
  -- nhau hoan toan, chi dung chung bo 7 gia tri ACCOUNT_TOPICS - dung bao gio gop lam mot.
  CREATE TABLE IF NOT EXISTS posting_account_topics (
    account_id  INTEGER NOT NULL,
    topic       TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    PRIMARY KEY (account_id, topic),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  );

  -- Mot lan "Phan phoi bai": N ngay x M bai/account/ngay.
  CREATE TABLE IF NOT EXISTS distribution_plans (
    id            TEXT PRIMARY KEY,
    name          TEXT,
    start_date    TEXT NOT NULL,          -- 'YYYY-MM-DD' theo gio dia phuong
    days          INTEGER NOT NULL,
    per_day       INTEGER NOT NULL,
    topics        TEXT,                   -- JSON array chu de gioi han (NULL = khong gioi han)
    account_count INTEGER NOT NULL,
    planned       INTEGER NOT NULL,       -- account_count * days * per_day
    assigned      INTEGER NOT NULL,       -- so slot thuc su gan duoc bai
    shortage      INTEGER NOT NULL,       -- planned - assigned
    seed          TEXT NOT NULL,          -- seed RNG -> tao lai duoc dung ket qua cu
    status        TEXT NOT NULL DEFAULT 'draft',
    created_at    TEXT NOT NULL,
    exported_at   TEXT
  );

  -- 1 dong = 1 slot (account, ngay, thu tu trong ngay). post_id NULL = slot thieu bai.
  -- CO Y KHONG dat FK sang posts: xoa bai khong duoc pha lich su cac ke hoach da xuat.
  -- account_name la SNAPSHOT (doi ten account van giu dung ten luc do trong lich su/file da xuat -
  -- xem renameInDistributionHistory).
  CREATE TABLE IF NOT EXISTS distribution_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id      TEXT NOT NULL,
    day_index    INTEGER NOT NULL,
    slot_index   INTEGER NOT NULL,
    post_date    TEXT NOT NULL,
    account_id   INTEGER,
    account_name TEXT NOT NULL,
    post_id      TEXT,
    topic        TEXT,
    created_at   TEXT NOT NULL,
    UNIQUE (plan_id, account_name, day_index, slot_index),
    FOREIGN KEY (plan_id) REFERENCES distribution_plans(id) ON DELETE CASCADE
  );

  -- Mot lan chay "viet lai caption bang AI": giu lai file Excel goc de luc xuat con ghi
  -- de dung o va giu nguyen cac cot khac.
  CREATE TABLE IF NOT EXISTS rewrite_batches (
    batch_id    TEXT PRIMARY KEY,
    file_name   TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    src_col     INTEGER NOT NULL,
    dest_col    INTEGER NOT NULL,
    created_at  TEXT NOT NULL
  );

  -- Luu DB (khong giu trong RAM) de sua tay dang do khong mat khi server restart.
  CREATE TABLE IF NOT EXISTS rewrite_rows (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id   TEXT NOT NULL,
    row_index  INTEGER NOT NULL,
    original   TEXT NOT NULL,
    rewritten  TEXT,
    error      TEXT,
    UNIQUE (batch_id, row_index),
    FOREIGN KEY (batch_id) REFERENCES rewrite_batches(batch_id) ON DELETE CASCADE
  );

  -- Cac ban caption "viet lai" cua 1 bai (dung cho Phan phoi bai: moi lan bai duoc phat lai o
  -- account khac thi dung luan phien 1 ban khac nhau, tranh nhieu account dang y het 1 caption).
  -- Luon ghi DU 3 dong trong 1 transaction (xem services/postCaptionVariants.ts) - khong bao gio
  -- de trang thai do dang, nen "co mat trong bang" = "du 3 ban".
  CREATE TABLE IF NOT EXISTS post_caption_variants (
    post_id        TEXT NOT NULL,
    variant_index  INTEGER NOT NULL,
    caption        TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    PRIMARY KEY (post_id, variant_index),
    FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE
  );

  -- ===== Hieu qua Affiliate: import bao cao Click + Hoa hong tu Shopee Affiliate =====
  -- Thoi gian luu nguyen chuoi 'YYYY-MM-DD HH:MM:SS' gio VN nhu file Shopee (khong doi UTC).
  -- Tien luu so nguyen milli-dong (x1000) - xem utils/money.ts.
  -- CO Y khong dat FK sang posts: bao cao co the chua Sub_id cua bai da xoa/chua cao; post_id chi
  -- la ket qua doi chieu (NULL = khong khop bai nao).
  CREATE TABLE IF NOT EXISTS aff_imports (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    kind         TEXT NOT NULL,            -- 'click' | 'commission'
    file_name    TEXT NOT NULL,
    rows         INTEGER NOT NULL,
    inserted     INTEGER NOT NULL,
    updated      INTEGER NOT NULL,
    skipped      INTEGER NOT NULL,
    min_time     TEXT,
    max_time     TEXT,
    imported_at  TEXT NOT NULL
  );

  -- 1 dong = 1 click. Bat bien -> import lai chi bo qua dong da co.
  CREATE TABLE IF NOT EXISTS aff_clicks (
    click_id    TEXT PRIMARY KEY,
    clicked_at  TEXT NOT NULL,
    region      TEXT,
    referrer    TEXT,
    sub_id_raw  TEXT,
    sub_id1     TEXT,
    sub_id2     TEXT,
    sub_id3     TEXT,
    sub_id4     TEXT,
    sub_id5     TEXT,
    post_id     TEXT,
    import_id   INTEGER
  );

  -- 1 dong = 1 SAN PHAM trong 1 don. Trang thai/hoa hong doi theo thoi gian -> import lai ghi de.
  -- Hoa hong cap DON chi nam o dong dau cua don (dong sau = 0) nen cong net_commission_milli theo
  -- tung dong la ra dung tong, khong nhan doi.
  CREATE TABLE IF NOT EXISTS aff_order_items (
    order_id              TEXT NOT NULL,
    item_id               TEXT NOT NULL,
    model_id              TEXT NOT NULL,
    checkout_id           TEXT,
    order_status          TEXT,
    product_status        TEXT,
    ordered_at            TEXT,
    completed_at          TEXT,
    clicked_at            TEXT,
    shop_name             TEXT,
    shop_id               TEXT,
    item_name             TEXT,
    quantity              INTEGER NOT NULL DEFAULT 0,
    price_milli           INTEGER NOT NULL DEFAULT 0,
    order_value_milli     INTEGER NOT NULL DEFAULT 0,
    refund_milli          INTEGER NOT NULL DEFAULT 0,
    net_commission_milli  INTEGER NOT NULL DEFAULT 0,
    attribution_type      TEXT,
    buyer_status          TEXT,
    channel               TEXT,
    sub_id1               TEXT,
    sub_id2               TEXT,
    sub_id3               TEXT,
    sub_id4               TEXT,
    sub_id5               TEXT,
    post_id               TEXT,
    click_id              TEXT,
    import_id             INTEGER,
    updated_at            TEXT NOT NULL,
    PRIMARY KEY (order_id, item_id, model_id)
  );

  -- ===== Nhat ky dang bai: tool auto dang goi API bao ket qua tung bai (api/automation.ts) =====
  -- 1 dong = 1 slot (ngay, nick, bai) - trung khoa voi ux_dist_date_account_post cua ke hoach nen
  -- khop duoc dung slot. Gui lai cung slot -> cap nhat (chi NANG trang thai, khong ha).
  -- status: 'posted' (dang bai OK) | 'commented' (dang bai + comment OK).
  -- dist_item_id NULL = bai dang ngoai ke hoach phan phoi.
  CREATE TABLE IF NOT EXISTS post_runs (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    post_date          TEXT NOT NULL,
    account_name       TEXT NOT NULL,
    post_id            TEXT NOT NULL,
    caption_variant    INTEGER,
    dist_item_id       INTEGER,
    status             TEXT NOT NULL,
    posted_url         TEXT,
    posted_at          TEXT,
    reports            INTEGER NOT NULL DEFAULT 1,
    first_reported_at  TEXT NOT NULL,
    last_reported_at   TEXT NOT NULL,
    UNIQUE (post_date, account_name, post_id)
  );
  CREATE INDEX IF NOT EXISTS idx_post_runs_date ON post_runs(post_date);

  CREATE INDEX IF NOT EXISTS idx_aff_clicks_sub_time ON aff_clicks(sub_id1, clicked_at);
  CREATE INDEX IF NOT EXISTS idx_aff_clicks_post ON aff_clicks(post_id);
  CREATE INDEX IF NOT EXISTS idx_aff_clicks_time ON aff_clicks(clicked_at);
  CREATE INDEX IF NOT EXISTS idx_aff_orders_post ON aff_order_items(post_id);
  CREATE INDEX IF NOT EXISTS idx_aff_orders_sub_time ON aff_order_items(sub_id1, clicked_at);
`);

// Migration: them cot new_link cho shopee_entries neu chua co (DB cu).
try {
  db.exec('ALTER TABLE shopee_entries ADD COLUMN new_link TEXT');
} catch {
  // cot da ton tai -> bo qua
}

// Migration: so comment (cua tac gia) co link shopee.
try {
  db.exec('ALTER TABLE posts ADD COLUMN shopee_comment_count INTEGER');
} catch {
  // cot da ton tai -> bo qua
}

// Truoc day 1 proxy chi duoc gan cho toi da 1 account. Yeu cau moi: 1 proxy dung chung cho
// NHIEU account -> go bo index unique cu (DB da tao tu ban truoc van con index nay).
try {
  db.exec('DROP INDEX IF EXISTS idx_accounts_proxy_unique');
} catch {
  // khong co index -> bo qua
}

// Migration: file video da "lam dep" (watermark/filter/crop/toc do), luu canh file goc.
try {
  db.exec('ALTER TABLE media ADD COLUMN processed_file TEXT');
} catch {
  // cot da ton tai -> bo qua
}

// Migration: mo rong bang accounts thanh kho quan ly account Threads day du
// (import tu Excel: Profile=name, Thiet bi, Banned, Ngay tao=created_at, Pass_Threads, Gmail, Password, Proxy).
for (const stmt of [
  'ALTER TABLE accounts ADD COLUMN device TEXT',
  'ALTER TABLE accounts ADD COLUMN banned INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE accounts ADD COLUMN pass_threads TEXT',
  'ALTER TABLE accounts ADD COLUMN gmail TEXT',
  'ALTER TABLE accounts ADD COLUMN gmail_password TEXT',
  'ALTER TABLE accounts ADD COLUMN proxy TEXT',
  'ALTER TABLE accounts ADD COLUMN platform TEXT',
  // Cot J/K/L cua file import: Loai proxy, Trang thai khang, Ghi chu.
  'ALTER TABLE accounts ADD COLUMN proxy_type TEXT',
  'ALTER TABLE accounts ADD COLUMN appeal_status TEXT',
  'ALTER TABLE accounts ADD COLUMN note TEXT',
  // Loai proxy + ghi chu luu luon sang kho proxy (lay tu cot J/L luc import account).
  'ALTER TABLE proxies ADD COLUMN proxy_type TEXT',
  'ALTER TABLE proxies ADD COLUMN note TEXT',
]) {
  try {
    db.exec(stmt);
  } catch {
    // cot da ton tai -> bo qua
  }
}

// Migration: trang thai xuat/dang bai + account co dinh (khong random lai moi lan export posts.xlsx).
for (const stmt of [
  'ALTER TABLE posts ADD COLUMN assigned_account TEXT',
  "ALTER TABLE posts ADD COLUMN post_status TEXT NOT NULL DEFAULT 'new'",
  'ALTER TABLE posts ADD COLUMN exported_at TEXT',
  'ALTER TABLE posts ADD COLUMN posted_at TEXT',
]) {
  try {
    db.exec(stmt);
  } catch {
    // cot da ton tai -> bo qua
  }
}

// Migration: trang thai kiem tra link Shopee (con hang/het hang/khong ton tai) truoc khi export.
for (const stmt of [
  'ALTER TABLE shopee_entries ADD COLUMN link_status TEXT',
  'ALTER TABLE shopee_entries ADD COLUMN link_message TEXT',
  'ALTER TABLE shopee_entries ADD COLUMN link_checked_at TEXT',
  'ALTER TABLE shopee_entries ADD COLUMN product_title TEXT',
  'ALTER TABLE shopee_entries ADD COLUMN product_image TEXT',
]) {
  try {
    db.exec(stmt);
  } catch {
    // cot da ton tai -> bo qua
  }
}

// Migration: bai duoc gan ban caption viet lai nao (NULL = dung caption goc, chua co ban viet lai
// luc lap ke hoach) - xem services/distribution.ts va post_caption_variants o tren.
try {
  db.exec('ALTER TABLE distribution_items ADD COLUMN caption_variant INTEGER');
} catch {
  // cot da ton tai -> bo qua
}

// Migration: doi ten gia tri enum 'Thanh cong' -> 'Khang thanh cong' (xem db/accountEnums.ts).
// Idempotent tu nhien: sau lan chay dau, khong con dong nao khop dieu kien WHERE nua.
db.exec("UPDATE accounts SET appeal_status = 'Kháng thành công' WHERE appeal_status = 'Thành công'");

// Index cho tinh nang "Phan phoi bai".
// KHONG con rang buoc "1 account khong bao gio nhan lai 1 bai TRON DOI" nua - da noi long xuong
// chung 1 luat gian ngay voi phan con lai (xem ux_dist_date_post): 1 account VAN duoc phep nhan
// lai dung bai da dang, mien la cach du ngay (khong nam trong cua so ±1 ngay).
//   - ux_dist_date_account_post: 1 account khong nhan TRUNG 1 bai trong CUNG 1 ngay (bat ke ban
//     caption nao) - an toan cho truong hop thuat toan lo chon lai dung bai do o slot khac cung
//     ngay cho CHINH account nay.
//   - ux_dist_date_post: don vi "noi dung" = (post_id, ban caption), KHONG phan biet account. Bai
//     KHONG co ban viet lai van bi khoa 1 lan/ngay nhu truoc (COALESCE ve 0). Bai CO 3 ban duoc
//     coi la 3 noi dung khac nhau nen duoc dung toi da 3 lan/ngay (moi lan 1 ban khac, bat ke
//     account nao) - vi caption khac nhau thi khong con la "dang trung noi dung" nua du chung 1
//     post_id/media.
// Luat "khong dung lai o hai ngay LIEN KE" (ca 2 index tren) khong dien dat duoc bang index
// (khong so duoc giua cac hang), nen duoc ep trong thuat toan - xem services/distribution.ts.
for (const stmt of ['DROP INDEX IF EXISTS ux_dist_date_post', 'DROP INDEX IF EXISTS ux_dist_account_post']) {
  try {
    db.exec(stmt);
  } catch {
    // khong co index -> bo qua
  }
}
for (const stmt of [
  'CREATE INDEX IF NOT EXISTS idx_pat_topic ON posting_account_topics(topic)',
  'CREATE INDEX IF NOT EXISTS idx_dist_items_plan ON distribution_items(plan_id, day_index, slot_index)',
  'CREATE INDEX IF NOT EXISTS idx_dist_items_account ON distribution_items(account_name, post_id)',
  'CREATE INDEX IF NOT EXISTS idx_dist_items_date ON distribution_items(post_date)',
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_dist_date_account_post
     ON distribution_items(post_date, account_name, post_id) WHERE post_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_dist_date_post
     ON distribution_items(post_date, post_id, COALESCE(caption_variant, 0)) WHERE post_id IS NOT NULL`,
]) {
  try {
    db.exec(stmt);
  } catch {
    // index da ton tai -> bo qua
  }
}

// Backfill cho bai cu (cot NULL): dem so comment distinct co link trong shopee_entries.
try {
  db.exec(`
    UPDATE posts SET shopee_comment_count = (
      SELECT COUNT(DISTINCT comment) FROM shopee_entries s WHERE s.post_id = posts.post_id
    ) WHERE shopee_comment_count IS NULL
  `);
} catch {
  // bo qua
}

// Migration: chu de chuyen tu gan theo TAC GIA (bang account_topics rieng) sang gan THANG vao
// TUNG BAI (cot posts.topic) - 1 tac gia co the dang o nhieu chu de, nhung 1 bai chi thuoc DUNG
// 1 chu de nen phai luu tren chinh dong bai do, khong the suy ra tu tac gia nua.
try {
  db.exec('ALTER TABLE posts ADD COLUMN topic TEXT');
} catch {
  // cot da ton tai -> bo qua
}
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_posts_topic ON posts(topic)');
} catch {
  // index da ton tai -> bo qua
}

// Backfill tu bang account_topics cu (neu con) sang posts.topic, roi xoa bang cu. Bang transaction
// de an toan neu server bi --watch restart giua chung. Chi backfill duoc CHINH XAC cho tac gia
// CHI CO DUNG 1 chu de (con lai suy tu tac gia, khong sai) - tac gia co NHIEU chu de thi khong biet
// bai nao thuoc chu de nao tu bang cu, phai sua tay tung bai (xem script mot lan da chay cho
// miu7498/trangxinh.207 luc chuyen doi).
{
  const hasOldTable = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'account_topics'")
    .get();
  if (hasOldTable) {
    db.exec('BEGIN');
    try {
      db.exec(`
        UPDATE posts SET topic = (
          SELECT t.topic FROM account_topics t WHERE t.username = posts.username LIMIT 1
        )
        WHERE topic IS NULL
          AND username IN (
            SELECT username FROM account_topics GROUP BY username HAVING COUNT(*) = 1
          );
        DROP TABLE account_topics;
      `);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

export function closeDb(): void {
  db.close();
}
