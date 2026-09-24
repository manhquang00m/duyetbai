import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { ACCOUNT_TOPICS } from '../db/accountTopics';
import {
  listPostingAccounts,
  bulkSetPostingTopics,
  setPostingTopics,
} from '../db/postingTopics';
import {
  cleanPoolByTopic,
  poolExclusionStats,
  listCleanPostsWithTopic,
  listPlans,
  getPlan,
  getPlanItems,
  deletePlan,
} from '../db/distribution';
import { previewPlan, generatePlan, DistributionError } from '../services/distribution';
import { exportPlanXlsx } from '../services/distributionExporter';
import { fileStamp } from '../utils/fileStamp';
import { EXPORT_DIR } from '../config';

const router = Router();

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const PlanOptionsSchema = z.object({
  days: z.number().int().min(1).max(60),
  perDay: z.number().int().min(1).max(20),
  startDate: dateStr,
  accountIds: z.array(z.number().int()).optional(),
  topics: z.array(z.enum(ACCOUNT_TOPICS)).optional(),
  scrapedFrom: dateStr.optional(),
  scrapedTo: dateStr.optional(),
  seed: z.string().trim().min(1).optional(),
  name: z.string().trim().max(120).optional(),
});

const TopicsSchema = z.array(z.enum(ACCOUNT_TOPICS));

/** Loi nghiep vu -> 400 kem thong diep tieng Viet; loi khac de middleware xu ly. */
function handle(res: import('express').Response, fn: () => unknown): void {
  try {
    res.json(fn());
  } catch (err) {
    if (err instanceof DistributionError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}

// GET /api/distribution/accounts -> account dang bai + chu de dang gan
router.get('/accounts', (_req, res) => {
  res.json(listPostingAccounts());
});

// POST /api/distribution/accounts/topics { accountId, topics } -> ghi de chu de 1 account
router.post('/accounts/topics', (req, res) => {
  const accountId = Number(req.body?.accountId);
  const parsed = TopicsSchema.safeParse(req.body?.topics);
  if (!Number.isFinite(accountId) || !parsed.success) {
    res.status(400).json({ error: 'accountId hoac topics khong hop le' });
    return;
  }
  setPostingTopics(accountId, parsed.data);
  res.json(listPostingAccounts());
});

// POST /api/distribution/accounts/topics/bulk { accountIds, topics, mode }
router.post('/accounts/topics/bulk', (req, res) => {
  const ids = (Array.isArray(req.body?.accountIds) ? req.body.accountIds : [])
    .map((v: unknown) => Number(v))
    .filter((v: number) => Number.isFinite(v));
  const parsed = TopicsSchema.safeParse(req.body?.topics);
  const mode = String(req.body?.mode ?? 'replace');
  if (ids.length === 0 || !parsed.success || !['add', 'remove', 'replace'].includes(mode)) {
    res.status(400).json({ error: 'accountIds / topics / mode khong hop le' });
    return;
  }
  bulkSetPostingTopics(ids, parsed.data, mode as 'add' | 'remove' | 'replace');
  res.json(listPostingAccounts());
});

// GET /api/distribution/pool -> kho bai sach + ly do bai bi loai
router.get('/pool', (_req, res) => {
  const byTopic: Record<string, number> = Object.fromEntries(
    ACCOUNT_TOPICS.map((t) => [t, 0]),
  );
  Object.assign(byTopic, cleanPoolByTopic());
  res.json({
    total: listCleanPostsWithTopic().length,
    byTopic,
    emptyTopics: Object.entries(byTopic)
      .filter(([, n]) => n === 0)
      .map(([t]) => t),
    excluded: poolExclusionStats(),
  });
});

// POST /api/distribution/preview -> mo phong, KHONG ghi gi vao DB
router.post('/preview', (req, res) => {
  const parsed = PlanOptionsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  handle(res, () => previewPlan(parsed.data));
});

// POST /api/distribution/plans -> tao ke hoach that
router.post('/plans', (req, res) => {
  const parsed = PlanOptionsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  handle(res, () => generatePlan(parsed.data));
});

router.get('/plans', (_req, res) => {
  res.json(listPlans());
});

router.get('/plans/:id', (req, res) => {
  const plan = getPlan(req.params.id);
  if (!plan) {
    res.status(404).json({ error: 'khong tim thay ke hoach' });
    return;
  }
  res.json({ plan, items: getPlanItems(req.params.id) });
});

router.delete('/plans/:id', (req, res) => {
  deletePlan(req.params.id);
  res.json({ ok: true });
});

// GET /api/distribution/plans/:id/export -> tai file xlsx cho tool auto dang
router.get('/plans/:id/export', async (req, res, next) => {
  try {
    const plan = getPlan(req.params.id);
    if (!plan) {
      res.status(404).json({ error: 'khong tim thay ke hoach' });
      return;
    }
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
    // Ten file theo planId: hai nguoi tai cung luc khong ghi de len nhau
    // (posts.xlsx cua luong cu dang co loi nay).
    const out = path.join(EXPORT_DIR, `phan_phoi_${plan.id}.xlsx`);
    await exportPlanXlsx(plan.id, out);
    res.download(out, `phan_phoi_${fileStamp()}.xlsx`);
  } catch (err) {
    next(err);
  }
});

export default router;
