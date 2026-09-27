import fs from 'node:fs';
import path from 'node:path';
import { format } from 'node:util';
import { LOG_DIR } from '../config';

// Ghi log ra file theo ngay: logs/server-YYYY-MM-DD.log (moi dong 1 JSON), giu LOG_KEEP_DAYS ngay.
// KHONG ghi body request / header (co the chua X-Api-Key, mat khau...) - chi method, path, status, ms.

const LOG_KEEP_DAYS = 14;

fs.mkdirSync(LOG_DIR, { recursive: true });

const pad = (n: number) => String(n).padStart(2, '0');
function localStamp(d = new Date()): { day: string; time: string } {
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { day, time: `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` };
}

export type LogLevel = 'info' | 'warn' | 'error';

export function writeLog(level: LogLevel, msg: string, extra?: Record<string, unknown>): void {
  const { day, time } = localStamp();
  const line = JSON.stringify({ time, level, msg, ...extra }) + '\n';
  // appendFileSync: log it, don gian, khong mat dong khi process chet ngay sau do.
  try {
    fs.appendFileSync(path.join(LOG_DIR, `server-${day}.log`), line);
  } catch {
    // khong ghi duoc log thi thoi, khong duoc lam hong request
  }
}

/** Xoa file log cu hon LOG_KEEP_DAYS ngay (chay 1 lan luc khoi dong). */
function cleanupOldLogs(): void {
  const cutoff = Date.now() - LOG_KEEP_DAYS * 86_400_000;
  for (const f of fs.readdirSync(LOG_DIR)) {
    if (!/^server-\d{4}-\d{2}-\d{2}\.log$/.test(f)) continue;
    const full = path.join(LOG_DIR, f);
    try {
      if (fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full);
    } catch {
      // bo qua
    }
  }
}

/**
 * Chep them console.error / console.warn vao file log - toan bo cho dang log loi san (job nen,
 * unhandledRejection...) tu dong duoc luu ma khong phai sua tung noi.
 */
export function installConsoleCapture(): void {
  cleanupOldLogs();
  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  console.error = (...args: unknown[]) => {
    origError(...args);
    writeLog('error', format(...args));
  };
  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    writeLog('warn', format(...args));
  };
}
