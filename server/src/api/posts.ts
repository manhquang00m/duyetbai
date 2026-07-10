import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { listPosts, getPostDetail, deletePost } from '../db/queries';
import { startRescrapeJob } from '../services/jobs';
import { DOWNLOAD_DIR } from '../config';

const router = Router();

// GET /api/posts?search=&limit=&offset=&noShopee=1&notUpdated=1
router.get('/', (req, res) => {
  const search = String(req.query.search ?? '');
  const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
  const offset = Number(req.query.offset ?? 0) || 0;
  const noShopee = req.query.noShopee === '1' || req.query.noShopee === 'true';
  const notUpdated = req.query.notUpdated === '1' || req.query.notUpdated === 'true';
  const oneShopee = req.query.oneShopee === '1' || req.query.oneShopee === 'true';
  res.json(listPosts({ search, limit, offset, noShopee, notUpdated, oneShopee }));
});

// POST /api/posts/rescrape { postIds: string[] } -> cao lai comment (job nen)
router.post('/rescrape', (req, res) => {
  const postIds = (Array.isArray(req.body?.postIds) ? req.body.postIds : [])
    .map((s: unknown) => String(s).trim())
    .filter(Boolean);
  if (postIds.length === 0) {
    res.status(400).json({ error: 'thieu postIds' });
    return;
  }
  const job = startRescrapeJob(postIds);
  res.status(202).json({ jobId: job.id, total: job.total });
});

// POST /api/posts/delete { postIds: string[] } -> xoa bai + folder media
router.post('/delete', (req, res) => {
  const postIds = (Array.isArray(req.body?.postIds) ? req.body.postIds : [])
    .map((s: unknown) => String(s).trim())
    .filter(Boolean);
  for (const id of postIds) {
    deletePost(id);
    fs.rm(path.join(DOWNLOAD_DIR, `post_${id}`), { recursive: true, force: true }, () => {});
  }
  res.json({ deleted: postIds.length });
});

// GET /api/posts/:id
router.get('/:id', (req, res) => {
  const detail = getPostDetail(req.params.id);
  if (!detail) {
    res.status(404).json({ error: 'khong tim thay bai' });
    return;
  }
  res.json(detail);
});

export default router;
