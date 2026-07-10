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
