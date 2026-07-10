import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Thu muc file nay: server/src  ->  len 2 cap = root repo
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

/**
 * Noi luu media tai ve. Mac dinh: <root repo>/downloads
 * Co the doi bang bien moi truong DOWNLOAD_DIR trong .env.
 */
export const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR
  ? path.resolve(process.env.DOWNLOAD_DIR)
  : path.join(repoRoot, 'downloads');

/** File SQLite. Mac dinh <root>/data/threads.db */
export const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(repoRoot, 'data', 'threads.db');

/** File chua danh sach URL (moi dong 1 URL). Mac dinh <root>/urls.txt */
export const URLS_FILE = process.env.URLS_FILE
  ? path.resolve(process.env.URLS_FILE)
  : path.join(repoRoot, 'urls.txt');

/** So bai chay song song. Playwright nang -> mac dinh thap. */
export const CONCURRENCY = Number(process.env.CONCURRENCY) || 2;

/** Noi xuat file Excel. Mac dinh <root>/exports */
export const EXPORT_DIR = process.env.EXPORT_DIR
  ? path.resolve(process.env.EXPORT_DIR)
  : path.join(repoRoot, 'exports');

/** File danh sach account (moi dong 1 ten). Mac dinh <root>/accounts.txt */
export const ACCOUNTS_FILE = process.env.ACCOUNTS_FILE
  ? path.resolve(process.env.ACCOUNTS_FILE)
  : path.join(repoRoot, 'accounts.txt');
