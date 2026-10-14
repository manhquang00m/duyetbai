import 'dotenv/config';
import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { DOWNLOAD_DIR, LOG_DIR } from './config';
import { installConsoleCapture, writeLog } from './utils/logger';
import { getStats } from './db/queries';
import postsRouter from './api/posts';
import accountsRouter from './api/accounts';
import batchRouter from './api/batch';
import shopeeRouter from './api/shopee';
import proxiesRouter from './api/proxies';
import settingsRouter from './api/settings';
import accountTopicsRouter from './api/accountTopics';
import rewriteRouter from './api/rewrite';
import distributionRouter from './api/distribution';
import postCaptionVariantsRouter from './api/postCaptionVariants';
import affiliateRouter from './api/affiliate';
import insightsRouter from './api/insights';
import automationRouter from './api/automation';
import postRunsRouter from './api/postRuns';

installConsoleCapture();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

// Log request API ra file: moi request LOI (status >= 400) hoac CHAM (> 3s), cong moi request cua
// tool auto (/api/automation) de doi chieu khi tool bao da gui ma khong thay. Chi method + path +
// status + ms - KHONG ghi query/body/header (co the chua key, mat khau).
app.use('/api', (req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - started;
    const path = req.baseUrl + req.path;
    const isTool = path.startsWith('/api/automation');
    if (res.statusCode < 400 && ms <= 3000 && !isTool) return;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 || ms > 3000 ? 'warn' : 'info';
    writeLog(level, `${req.method} ${path} -> ${res.statusCode} (${ms}ms)`, {
      method: req.method,
      path,
      status: res.statusCode,
      ms,
    });
  });
  next();
});

const STARTED_AT = new Date().toISOString();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'threads-downloader-server' });
});

// Nut kiem tra server tren header UI goi qua Vite proxy (chi proxy /api) - startedAt doi = server
// vua khoi dong lai.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', startedAt: STARTED_AT, uptimeSec: Math.round(process.uptime()) });
});

app.get('/api/stats', (_req, res) => {
  res.json(getStats());
});

// Phuc vu media da tai ve (video/anh) cho UI preview
app.use('/media', express.static(DOWNLOAD_DIR));

// REST API
app.use('/api/posts', postsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/batch', batchRouter);
app.use('/api/proxies', proxiesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/account-topics', accountTopicsRouter);
app.use('/api/rewrite', rewriteRouter);
app.use('/api/distribution', distributionRouter);
app.use('/api/post-caption-variants', postCaptionVariantsRouter);
app.use('/api/affiliate', affiliateRouter);
app.use('/api/insights', insightsRouter);
app.use('/api/automation', automationRouter);
app.use('/api/post-runs', postRunsRouter);
app.use('/api', shopeeRouter); // /api/export/*, /api/import/*, /api/shopee/*

// Loi khong ai bat trong route -> ghi log day du vao file, nhung chi tra thong bao CHUNG cho nguoi
// goi (khong lo stack trace / duong dan / cau SQL).
const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Body gui voi Content-Type application/json nhung sai cu phap JSON -> loi cua nguoi goi (400),
  // khong phai loi server.
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    const detail = err instanceof Error ? err.message : 'JSON lỗi';
    console.warn(`[api] 400: ${req.method} ${req.baseUrl + req.path} body KHONG phai JSON hop le (${detail})`);
    res.status(400).json({
      error: `Body không phải JSON hợp lệ: ${detail}. Kiểm tra: chỉ dùng nháy kép "...", biến đã được thay giá trị, không thừa dấu phẩy.`,
    });
    return;
  }
  console.error(`[api] ${req.method} ${req.baseUrl + req.path} loi:`, err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Lỗi server — xem log để biết chi tiết' });
};
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT} · log: ${LOG_DIR}`);
  writeLog('info', `server khoi dong tai cong ${PORT}`);
});

// Node 19+ (dang chay 22): agent mac dinh cua Vite proxy GIU ket noi keep-alive ~5s, dung bang
// keepAliveTimeout mac dinh 5s cua server -> co luc Vite tai dung socket server vua dong -> 502.
// Cho server giu lau hon han phia client de ben client luon dong truoc.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

// 1 promise loi khong ai bat (thuong trong job nen: cao bai, check proxy...) mac dinh GIET ca
// process -> duoi `node --watch` server nam chet cho toi khi co file thay doi, moi API qua Vite
// deu 502. Log lai thay vi chet ca server.
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection (da bo qua, server van chay):', reason);
});
