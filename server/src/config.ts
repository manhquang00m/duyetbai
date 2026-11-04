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
 * Danh sach model xep theo thu tu uu tien, ngan cach bang dau phay.
 * Model het quota (ngay/phut) hoac khong con ton tai (404) -> tu chuyen model ke tiep (services/llm.ts).
 * Free tier (AI Studio, 10/2026): 3.5-flash-lite 15 RPM/500 RPD; 2.5-flash-lite 10/20;
 * 3-flash-preview 5/20; 2.5-flash 5/20 -> Lite dat truoc, cac ban 20/ngay chi la du phong.
 */
export const LLM_MODELS = (
  process.env.LLM_MODEL ||
  'gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-2.5-flash-lite,gemini-3-flash-preview,gemini-2.5-flash'
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

/**
 * Danh sach API key, ngan cach bang dau phay - dung NHIEU key de cong don quota/ngay (moi key
 * Google cap quota RIENG). Het quota ngay o key dau (voi 1 model) -> tu chuyen sang key ke tiep
 * CHO CUNG model do truoc khi chuyen sang model ke tiep (xem services/llm.ts).
 * KHONG hardcode key o day - dien trong .env (da nam trong .gitignore).
 */
export const LLM_API_KEYS = (process.env.LLM_API_KEY || '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);

/** So request AI chay song song. De thap vi free tier siet so request/phut. */
export const LLM_CONCURRENCY = Number(process.env.LLM_CONCURRENCY) || 2;

/**
 * Tran so request LLM moi phut - tu gioi han o phia minh cho khop quota nha cung cap.
 * Ban Flash Lite hien cho 15 request/phut; de mac dinh 12 cho co bien an toan.
 */
export const LLM_RPM = Number(process.env.LLM_RPM) || 12;

/**
 * File luu session dang nhap Shopee (cookie/localStorage) - tao boi script `npm run shopee:login`,
 * dung lai khi kiem tra link Shopee de giam bi chan boi he thong chong-bot (khong con la phien an danh).
 * KHONG commit (da nam trong .gitignore, thu muc .pw-session/).
 */
export const SHOPEE_SESSION_PATH = path.join(repoRoot, '.pw-session', 'shopee.json');

/**
 * ===== Dong bo proxy tu GPM Login (antidetect browser) =====
 * GPM Login chay local API rieng cho tung ban (Global/Stable) neu ban cai/mo ca 2 cung luc.
 * accounts.platform ('Stable' | 'Global') quyet dinh goi ban nao - xem services/gpmLogin.ts.
 * Doi port qua .env neu may ban khac (vd GPM tu doi port do 9495/19995 dang ban).
 */
export const GPM_GLOBAL_URL = process.env.GPM_GLOBAL_URL || 'http://127.0.0.1:9495';
export const GPM_STABLE_URL = process.env.GPM_STABLE_URL || 'http://127.0.0.1:19995';

/**
 * ===== Check shadowban (services/shadowbanCheck.ts) =====
 * Nick "viewer": 1 profile GPM DA DANG NHAP Threads bang nick KHAC (khong phai nick dang check),
 * dung de search @username xem nick co hien trong ket qua tim kiem khong. De trong -> bo qua buoc
 * nay, chi check bang trang profile/bai luc khong dang nhap.
 */
export const SHADOWBAN_VIEWER_PROFILE_ID = process.env.SHADOWBAN_VIEWER_PROFILE_ID?.trim() || '';
export const SHADOWBAN_VIEWER_EDITION: 'global' | 'stable' =
  process.env.SHADOWBAN_VIEWER_EDITION?.trim().toLowerCase() === 'global' ? 'global' : 'stable';

/** So bai gan nhat (da dang >= 12h) dung tinh median view "hien tai". */
export const SHADOWBAN_RECENT_POSTS = Number(process.env.SHADOWBAN_RECENT_POSTS) || 5;

/** So bai cu hon lay them moi lan check de lam baseline (cong voi lich su da luu trong DB). */
export const SHADOWBAN_BASELINE_POSTS = Number(process.env.SHADOWBAN_BASELINE_POSTS) || 5;

/**
 * Khoa cho tool auto dang goi API bao ket qua dang bai (header X-Api-Key). KHONG co gia tri mac
 * dinh: de trong -> API tu choi het (fail closed) - xem api/automation.ts.
 */
export const AUTOMATION_API_KEY = process.env.AUTOMATION_API_KEY?.trim() || '';

/** Thu muc file log server (logs/server-YYYY-MM-DD.log). Mac dinh <root>/logs */
export const LOG_DIR = process.env.LOG_DIR
  ? path.resolve(process.env.LOG_DIR)
  : path.join(repoRoot, 'logs');
