import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { DOWNLOAD_DIR } from './config';
import { getStats } from './db/queries';
import postsRouter from './api/posts';
import accountsRouter from './api/accounts';
import batchRouter from './api/batch';
import shopeeRouter from './api/shopee';
import proxiesRouter from './api/proxies';
import settingsRouter from './api/settings';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'threads-downloader-server' });
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
app.use('/api', shopeeRouter); // /api/export/*, /api/import/*, /api/shopee/*

app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
});
