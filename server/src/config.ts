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

/**
 * Duong dan toi binary ffmpeg (dung cho tinh nang "lam dep video").
 * Mac dinh 'ffmpeg' -> yeu cau da cai dat va co trong PATH he thong.
 * Doi bang bien moi truong FFMPEG_PATH neu ffmpeg nam o noi khac.
 */
export const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

/**
 * ===== AI viet lai caption =====
 * Goi qua chuan OpenAI /chat/completions nen doi nha cung cap chi can sua .env, khong sua code:
 *   Gemini (free)  https://generativelanguage.googleapis.com/v1beta/openai  + model gemini-*
 *   DeepSeek       https://api.deepseek.com/v1                              + model deepseek-chat
 *   Groq (free)    https://api.groq.com/openai/v1                           + model llama-*
 *   OpenRouter     https://openrouter.ai/api/v1                             + model <hang>/<model>:free
 */
export const LLM_BASE_URL =
  process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai';

/**
 * Ten model. Google khai tu model kha nhanh (ban 2.5-flash da ngung cap cho key moi) - neu
 * bao 404 kem cau "no longer available" thi trong chinh thong bao loi co ten model thay the.
 */
export const LLM_MODEL = process.env.LLM_MODEL || 'gemini-3.6-flash';

/** KHONG hardcode key o day - dien trong .env (da nam trong .gitignore). */
export const LLM_API_KEY = process.env.LLM_API_KEY || '';

/** So request AI chay song song. De thap vi free tier siet so request/phut. */
export const LLM_CONCURRENCY = Number(process.env.LLM_CONCURRENCY) || 2;

/**
 * File luu session dang nhap Shopee (cookie/localStorage) - tao boi script `npm run shopee:login`,
 * dung lai khi kiem tra link Shopee de giam bi chan boi he thong chong-bot (khong con la phien an danh).
 * KHONG commit (da nam trong .gitignore, thu muc .pw-session/).
 */
export const SHOPEE_SESSION_PATH = path.join(repoRoot, '.pw-session', 'shopee.json');
