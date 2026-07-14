import { Router } from 'express';
import {
  listProxies,
  saveProxies,
  removeProxy,
  getProxy,
  updateProxyStatus,
  type ProxyInput,
} from '../db/proxies';
import { checkProxies, checkProxy } from '../services/proxyCheck';
import { startProxyCheckJob } from '../services/jobs';

const router = Router();

const toList = (raw: unknown): string[] =>
  (Array.isArray(raw) ? raw : []).map((s) => String(s).trim()).filter(Boolean);

// GET /api/proxies -> danh sach da luu
router.get('/', (_req, res) => {
  res.json(listProxies());
});

// POST /api/proxies/check { proxies: string[] } -> Live/Die (khong luu)
router.post('/check', async (req, res, next) => {
  try {
    const proxies = toList(req.body?.proxies);
    if (proxies.length === 0) {
      res.status(400).json({ error: 'thieu proxies' });
      return;
    }
    res.json(await checkProxies(proxies));
  } catch (err) {
    next(err);
  }
});

// POST /api/proxies/check-job { proxies: string[] } -> chay job nen, xem tien trinh qua
// GET /api/batch/:id/stream (dung chung 1 job store voi cac job khac trong jobs.ts)
router.post('/check-job', (req, res) => {
  const proxies = toList(req.body?.proxies);
  if (proxies.length === 0) {
    res.status(400).json({ error: 'thieu proxies' });
    return;
  }
  const job = startProxyCheckJob(proxies);
  res.status(202).json({ jobId: job.id, total: job.total });
});

// POST /api/proxies { items: [{proxy,status,ip}] } -> luu
router.post('/', (req, res) => {
  const items = (Array.isArray(req.body?.items) ? req.body.items : []) as ProxyInput[];
  if (items.length === 0) {
    res.status(400).json({ error: 'thieu items' });
    return;
  }
  saveProxies(items);
  res.status(201).json(listProxies());
});

// POST /api/proxies/:id/recheck -> check lai 1 proxy da luu
router.post('/:id/recheck', async (req, res, next) => {
  try {
    const p = getProxy(Number(req.params.id));
    if (!p) {
      res.status(404).json({ error: 'khong tim thay' });
      return;
    }
    const result = await checkProxy(p.proxy);
    updateProxyStatus(p.id, result.status, result.ip ?? null);
    res.json(listProxies());
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req, res) => {
  removeProxy(Number(req.params.id));
  res.json(listProxies());
});

export default router;
