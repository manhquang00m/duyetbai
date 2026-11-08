import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { isTopic, listTopicNames } from '../db/topics';
import { MEDIA_FILTERS } from '../db/queries';
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
  getPlanItemsDetailed,
  deletePlan,
} from '../db/distribution';
import { previewPlan, generatePlan, DistributionError } from '../services/distribution';
import {
  createManual,
  listCandidates,
  addItem,
  removeItem,
  setItemVariant,
} from '../services/manualDistribution';
import { VARIANT_COUNT } from '../services/postCaptionVariants';
import { isValidDate } from '../utils/dates';
import { exportPlanXlsx } from '../services/distributionExporter';
import { fileStamp } from '../utils/fileStamp';
import { EXPORT_DIR } from '../config';

const router = Router();

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const realDate = dateStr.refine(isValidDate, 'Ngày không hợp lệ');
const TopicSchema = z.string().refine(isTopic, 'Chủ đề không hợp lệ');

const PlanOptionsSchema = z.object({
  days: z.number().int().min(1).max(60),
  perDay: z.number().int().min(1).max(20),
  startDate: dateStr,
  accountIds: z.array(z.number().int()).optional(),
  topics: z.array(TopicSchema).optional(),
  scrapedFrom: dateStr.optional(),
  scrapedTo: dateStr.optional(),
  seed: z.string().trim().min(1).optional(),
  name: z.string().trim().max(120).optional(),
});

const TopicsSchema = z.array(TopicSchema);

/** Loi nghiep vu -> status (400/404/409) kem thong diep tieng Viet; loi khac de middleware xu ly. */
function handle(res: import('express').Response, fn: () => unknown): void {
  try {
    res.json(fn());
  } catch (err) {
    if (err instanceof DistributionError) {
      res.status(err.status).json({ error: err.message, code: err.code, ...err.details });
      return;
    }
    throw err;
  }
}

// ---- Ke hoach thu cong ----
const ManualPlanSchema = z.object({
  name: z.string().trim().max(120).optional(),
  startDate: realDate,
  days: z.number().int().min(1).max(60),
});

const CandidatesQuery = z.object({
  accountId: z.coerce.number().int().positive(),
  postDate: realDate,
  topics: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]))
    .pipe(z.array(TopicSchema).max(50).optional()),
  search: z.string().trim().max(100).optional(),
  media: z.enum(MEDIA_FILTERS).optional(),
  hideUsed: z
    .enum(['1', '0', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

const AddItemSchema = z.object({
  accountId: z.number().int().positive(),
  postDate: realDate,
  postId: z.string().trim().min(1).max(200),
  confirmGap: z.boolean().optional(),
  variant: z.number().int().min(1).max(VARIANT_COUNT).nullable().optional(),
});

const VariantSchema = z.object({
  variant: z.number().int().min(1).max(VARIANT_COUNT).nullable(),
});

const itemIdParam = z.coerce.number().int().positive();

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
    listTopicNames().map((t) => [t, 0]),
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
  res.json({ plan, items: getPlanItemsDetailed(req.params.id) });
});

// POST /api/distribution/plans/manual { name?, startDate, days } -> ke hoach thu cong rong
router.post('/plans/manual', (req, res) => {
  const parsed = ManualPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  handle(res, () => createManual(parsed.data));
});

// GET /api/distribution/plans/:id/candidates?accountId&postDate&topics&search&media&hideUsed&limit&offset
// -> bai trong kho thuoc chu de cua nick, nhieu like nhat truoc, kem trang thai luat gian ngay
router.get('/plans/:id/candidates', (req, res) => {
  const parsed = CandidatesQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  handle(res, () => listCandidates({ planId: req.params.id, ...parsed.data }));
});

// POST /api/distribution/plans/:id/items { accountId, postDate, postId, confirmGap?, variant? }
router.post('/plans/:id/items', (req, res) => {
  const parsed = AddItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  handle(res, () => addItem({ planId: req.params.id, ...parsed.data }));
});

router.delete('/plans/:id/items/:itemId', (req, res) => {
  const itemId = itemIdParam.safeParse(req.params.itemId);
  if (!itemId.success) {
    res.status(400).json({ error: 'itemId khong hop le' });
    return;
  }
  handle(res, () => removeItem(req.params.id, itemId.data));
});

// PATCH /api/distribution/plans/:id/items/:itemId { variant } -> doi ban caption
router.patch('/plans/:id/items/:itemId', (req, res) => {
  const itemId = itemIdParam.safeParse(req.params.itemId);
  const parsed = VariantSchema.safeParse(req.body);
  if (!itemId.success || !parsed.success) {
    res.status(400).json({ error: 'itemId hoac variant khong hop le' });
    return;
  }
  handle(res, () => {
    setItemVariant(req.params.id, itemId.data, parsed.data.variant);
    return { ok: true };
  });
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
