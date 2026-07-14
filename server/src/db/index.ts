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

// Rang buoc: 1 proxy chi duoc gan cho toi da 1 account (bo trong/NULL). Neu DB dang co san
// du lieu trung tu truoc (import cu) thi lenh nay se loi -> bo qua, code tang ung dung
// (db/accounts.ts) van chan duoc truong hop trung cho cac thay doi MOI tu day ve sau.
try {
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_proxy_unique ON accounts(proxy) WHERE proxy IS NOT NULL AND proxy <> ''",
  );
} catch {
  // du lieu cu dang trung -> bo qua, khong chan server khoi dong
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

export function closeDb(): void {
  db.close();
}
