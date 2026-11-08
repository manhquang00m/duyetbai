import { randomUUID } from 'node:crypto';
import { db } from './index';
import {
  CLEAN_POST_COND,
  LINKS_OK_COND,
  HAS_VIDEO,
  HAS_IMAGE,
  LIKES_NUM,
  mediaFilterCond,
  type MediaFilter,
} from './queries';

export interface PlanRow {
  id: string;
  name: string | null;
  start_date: string;
  days: number;
  per_day: number;
  topics: string | null;
  account_count: number;
  planned: number;
  assigned: number;
  shortage: number;
  seed: string;
  status: string;
  created_at: string;
  exported_at: string | null;
  kind?: 'auto' | 'manual'; // cot them bang migration, plan cu = 'auto'
  updated_at?: string | null; // lan sua tay cuoi (ke hoach thu cong)
}

export interface PlanItemRow {
  id: number;
  plan_id: string;
  day_index: number;
  slot_index: number;
  post_date: string;
  account_id: number | null;
  account_name: string;
  post_id: string | null;
  topic: string | null;
  caption_variant: number | null; // ban caption da dung (1..VARIANT_COUNT), NULL = dung caption goc
}

export interface CleanPost {
  post_id: string;
  topic: string;
}

export interface CleanPoolFilter {
  topics?: string[];
  scrapedFrom?: string; // 'YYYY-MM-DD', theo gio VN (+7) - loc theo THOI DIEM THU THAP (scraped_at)
  scrapedTo?: string; // 'YYYY-MM-DD', bao gom ca ngay nay
}

// scraped_at luu ISO UTC ("...Z") - quy doi ve gio VN (+7) truoc khi lay ngay, giong het cach
// lam o db/queries.ts (buildPostFilterConds) de 2 noi loc ra CUNG 1 ket qua.
function scrapedDateConds(f: Pick<CleanPoolFilter, 'scrapedFrom' | 'scrapedTo'>): {
  conds: string[];
  args: string[];
} {
  const conds: string[] = [];
  const args: string[] = [];
  if (f.scrapedFrom) {
    conds.push("date(p.scraped_at, '+7 hours') >= ?");
    args.push(f.scrapedFrom);
  }
  if (f.scrapedTo) {
    conds.push("date(p.scraped_at, '+7 hours') <= ?");
    args.push(f.scrapedTo);
  }
  return { conds, args };
}

/**
 * Kho bai du dieu kien phan phoi: bai SACH (CLEAN_POST_COND), CO media tai duoc, va DA duoc gan
 * chu de (posts.topic) - khong co chu de thi khong biet phat cho account nao.
 * Vế media tranh xuat ra dong co ca VideoPath lan ImagePath rong cho tool auto dang.
 */
export function listCleanPostsWithTopic(filter: CleanPoolFilter = {}): CleanPost[] {
  const conds = [CLEAN_POST_COND, `(${HAS_VIDEO} OR ${HAS_IMAGE})`, 'p.topic IS NOT NULL'];
  const args: string[] = [];
  if (filter.topics && filter.topics.length > 0) {
    conds.push(`p.topic IN (${filter.topics.map(() => '?').join(',')})`);
    args.push(...filter.topics);
  }
  const scraped = scrapedDateConds(filter);
  conds.push(...scraped.conds);
  args.push(...scraped.args);
  return db
    .prepare(
      `SELECT p.post_id AS post_id, p.topic AS topic
         FROM posts p
        WHERE ${conds.join(' AND ')}
        ORDER BY p.post_id`,
    )
    .all(...args) as unknown as CleanPost[];
}

/**
 * Bai can chuan bi 3 ban caption: nhu kho phan phoi nhung CHUA can new_link (LINKS_OK_COND) va
 * CHUA can gan chu de - viet lai truoc, cap nhat link moi / gan chu de sau thi bai vao kho la co
 * san caption.
 */
export function listRewritablePosts(): { post_id: string; topic: string | null }[] {
  return db
    .prepare(
      `SELECT p.post_id AS post_id, p.topic AS topic
         FROM posts p
        WHERE ${LINKS_OK_COND} AND (${HAS_VIDEO} OR ${HAS_IMAGE})
        ORDER BY p.post_id`,
    )
    .all() as unknown as { post_id: string; topic: string | null }[];
}

/** Dem bai sach theo tung chu de - cho the "Kho bai" tren UI. */
export function cleanPoolByTopic(
  filter: Pick<CleanPoolFilter, 'scrapedFrom' | 'scrapedTo'> = {},
): Record<string, number> {
  const conds = [CLEAN_POST_COND, `(${HAS_VIDEO} OR ${HAS_IMAGE})`, 'p.topic IS NOT NULL'];
  const args: string[] = [];
  const scraped = scrapedDateConds(filter);
  conds.push(...scraped.conds);
  args.push(...scraped.args);
  const rows = db
    .prepare(
      `SELECT p.topic AS topic, COUNT(*) AS n
         FROM posts p
        WHERE ${conds.join(' AND ')}
        GROUP BY p.topic`,
    )
    .all(...args) as unknown as { topic: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.topic, r.n]));
}

/** Vi sao bai bi loai khoi kho - de UI giai thich duoc con so. */
export function poolExclusionStats(): Record<string, number> {
  const n = (cond: string) =>
    (
      db.prepare(`SELECT COUNT(*) AS n FROM posts p WHERE ${cond}`).get() as unknown as {
        n: number;
      }
    ).n;
  return {
    total: n('1 = 1'),
    noShopee: n('NOT EXISTS (SELECT 1 FROM shopee_entries s WHERE s.post_id = p.post_id)'),
    notChecked: n(
      "EXISTS (SELECT 1 FROM shopee_entries s WHERE s.post_id = p.post_id AND s.link_status IS NULL)",
    ),
    badLink: n(
      "EXISTS (SELECT 1 FROM shopee_entries s WHERE s.post_id = p.post_id AND s.link_status IN ('dead','out_of_stock','unknown'))",
    ),
    noNewLink: n(
      "EXISTS (SELECT 1 FROM shopee_entries s WHERE s.post_id = p.post_id AND (s.new_link IS NULL OR s.new_link = ''))",
    ),
    noTopic: n('p.topic IS NULL'),
    noMedia: n(`NOT (${HAS_VIDEO} OR ${HAS_IMAGE})`),
  };
}

/**
 * Khoa dinh danh "don vi noi dung" cho luat chong trung theo ngay: 1 bai KHONG co ban caption
 * viet lai chi co DUNG 1 don vi (variant coi nhu 0); bai CO ban viet lai thi moi ban la 1 don vi
 * RIENG - dung lai post_id do trong cung ngay/ngay lien ke van duoc, MIEN LA khac ban caption,
 * vi luc do noi dung hien thi (caption) da khac nhau, khong con "dang trung" nhu truoc nua.
 */
export function contentKey(postId: string, variant: number | null): string {
  return `${postId}#${variant ?? 0}`;
}

/** Noi dung (post_id+ban caption) da dung trong tung ngay (tinh ca ke hoach cu) - phuc vu luat gian ngay lien ke. */
export function loadUsageByDate(dates: string[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  if (dates.length === 0) return m;
  const rows = db
    .prepare(
      `SELECT post_date, post_id, caption_variant FROM distribution_items
        WHERE post_id IS NOT NULL AND post_date IN (${dates.map(() => '?').join(',')})`,
    )
    .all(...dates) as unknown as {
    post_date: string;
    post_id: string;
    caption_variant: number | null;
  }[];
  for (const r of rows) {
    if (!m.has(r.post_date)) m.set(r.post_date, new Set());
    m.get(r.post_date)!.add(contentKey(r.post_id, r.caption_variant));
  }
  return m;
}

/**
 * So lan tung BAI (gop tat ca ban caption) da duoc dung - de chon bai IT DUNG NHAT trong ca kho,
 * rai deu viec su dung thay vi cay di cay lai vai bai.
 */
export function loadPostUsageCount(): Map<string, number> {
  const rows = db
    .prepare(
      'SELECT post_id, COUNT(*) AS n FROM distribution_items WHERE post_id IS NOT NULL GROUP BY post_id',
    )
    .all() as unknown as { post_id: string; n: number }[];
  return new Map(rows.map((r) => [r.post_id, r.n]));
}

/**
 * So lan tung don vi noi dung (post_id + ban caption cu the) da duoc dung - de trong so ban da
 * chon (theo pool bai) xong, uu tien ban IT DUNG NHAT / MOI NHAT trong cac ban con TRONG cua ngay do.
 */
export function loadVariantUsageCount(): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT post_id, caption_variant, COUNT(*) AS n FROM distribution_items
        WHERE post_id IS NOT NULL GROUP BY post_id, caption_variant`,
    )
    .all() as unknown as { post_id: string; caption_variant: number | null; n: number }[];
  return new Map(rows.map((r) => [contentKey(r.post_id, r.caption_variant), r.n]));
}

/**
 * Bai nao da co du ban caption viet lai (xem post_caption_variants) - dung de quyet dinh gan
 * caption_variant khi lap ke hoach. Bang nay luon ghi DU VARIANT_COUNT dong trong 1 transaction
 * (services/postCaptionVariants.ts) nen "co mat" = "du ban", khong can dem so dong.
 */
export function loadPostsWithVariants(): Set<string> {
  const rows = db.prepare('SELECT DISTINCT post_id FROM post_caption_variants').all() as {
    post_id: string;
  }[];
  return new Set(rows.map((r) => r.post_id));
}

const insPlan = db.prepare(
  `INSERT INTO distribution_plans
     (id, name, start_date, days, per_day, topics, account_count, planned, assigned, shortage,
      seed, status, created_at, exported_at)
   VALUES (@id, @name, @start_date, @days, @per_day, @topics, @account_count, @planned,
           @assigned, @shortage, @seed, @status, @created_at, @exported_at)`,
);
const insItem = db.prepare(
  `INSERT INTO distribution_items
     (plan_id, day_index, slot_index, post_date, account_id, account_name, post_id, topic,
      caption_variant, created_at)
   VALUES (@plan_id, @day_index, @slot_index, @post_date, @account_id, @account_name, @post_id,
           @topic, @caption_variant, @created_at)`,
);

/** Ghi plan + items trong MOT transaction: loi giua chung khong de lai ke hoach dang do. */
export function insertPlan(plan: PlanRow, items: Omit<PlanItemRow, 'id'>[]): void {
  db.exec('BEGIN');
  try {
    insPlan.run({ ...plan });
    const now = new Date().toISOString();
    for (const it of items) insItem.run({ ...it, created_at: now });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function listPlans(): PlanRow[] {
  return db
    .prepare('SELECT * FROM distribution_plans ORDER BY created_at DESC')
    .all() as unknown as PlanRow[];
}

export function getPlan(id: string): PlanRow | null {
  return (
    (db.prepare('SELECT * FROM distribution_plans WHERE id = ?').get(id) as
      | unknown
      | undefined as PlanRow | undefined) ?? null
  );
}

export function getPlanItems(id: string): PlanItemRow[] {
  return db
    .prepare(
      `SELECT id, plan_id, day_index, slot_index, post_date, account_id, account_name, post_id,
              topic, caption_variant
         FROM distribution_items WHERE plan_id = ?
        ORDER BY day_index, slot_index, account_name`,
    )
    .all(id) as unknown as PlanItemRow[];
}

/** Xoa ke hoach - CASCADE xoa items, tuc GIAI PHONG lich su chong trung cua ke hoach do. */
export function deletePlan(id: string): void {
  db.prepare('DELETE FROM distribution_plans WHERE id = ?').run(id);
}

export function markPlanExported(id: string): void {
  db.prepare("UPDATE distribution_plans SET status = 'exported', exported_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    id,
  );
}

// ======================================================================
//  Ke hoach THU CONG: nguoi dung tu chon bai cho tung nick (xem services/manualDistribution.ts)
// ======================================================================

/** Dieu kien "bai trong kho phan phoi" - GIONG HET listCleanPostsWithTopic de 2 luong khong lech nhau. */
const POOL_COND = `${CLEAN_POST_COND} AND (${HAS_VIDEO} OR ${HAS_IMAGE}) AND p.topic IS NOT NULL`;

// Anh dai dien cua bai: uu tien anh, khong co thi file media dau tien (giong listPosts)
const THUMB_FILE = (col: string) => `COALESCE(
  (SELECT file FROM media m WHERE m.post_id = ${col} AND m.type = 'image' AND m.ok = 1 ORDER BY id LIMIT 1),
  (SELECT file FROM media m WHERE m.post_id = ${col} AND m.ok = 1 ORDER BY id LIMIT 1)
)`;
const thumbPath = (postId: string | null, file: string | null) =>
  postId && file ? `post_${postId}/${file}` : null;

export function createManualPlan(p: { name: string | null; startDate: string; days: number }): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO distribution_plans
       (id, name, start_date, days, per_day, topics, account_count, planned, assigned, shortage,
        seed, status, created_at, exported_at, kind, updated_at)
     VALUES (?, ?, ?, ?, 0, NULL, 0, 0, 0, 0, 'manual', 'draft', ?, NULL, 'manual', ?)`,
  ).run(id, p.name, p.startDate, p.days, now, now);
  return id;
}

export interface PoolPostRow {
  post_id: string;
  username: string | null;
  caption: string | null;
  likes: string | null;
  topic: string;
  variant_count: number;
  thumb: string | null; // duong dan tuong doi duoi /media, giong listPosts
}

// LIKE an toan: escape ky tu dai dien de chuoi tim "50%" khong thanh "khop moi thu"
const likeArg = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Bai trong kho thuoc cac chu de cho truoc, NHIEU LIKE NHAT TRUOC. `hideUsedFrom/To` (neu co):
 * an bai da dung (bat ky nick/plan nao) trong khoang ngay do - toggle "An bai da dung quanh ngay nay".
 */
export function listPoolPostsByLikes(f: {
  topics: string[];
  search?: string;
  media?: MediaFilter;
  hideUsedFrom?: string;
  hideUsedTo?: string;
  limit: number;
  offset: number;
}): { total: number; items: PoolPostRow[] } {
  if (f.topics.length === 0) return { total: 0, items: [] };
  const conds = [POOL_COND, `p.topic IN (${f.topics.map(() => '?').join(',')})`];
  const args: (string | number)[] = [...f.topics];
  const search = (f.search ?? '').trim();
  if (search) {
    conds.push(
      "(p.caption LIKE ? ESCAPE '\\' OR p.post_id LIKE ? ESCAPE '\\' OR p.username LIKE ? ESCAPE '\\')",
    );
    args.push(likeArg(search), likeArg(search), likeArg(search));
  }
  if (f.media) conds.push(mediaFilterCond(f.media));
  if (f.hideUsedFrom && f.hideUsedTo) {
    conds.push(
      `NOT EXISTS (SELECT 1 FROM distribution_items d
                    WHERE d.post_id = p.post_id AND d.post_date BETWEEN ? AND ?)`,
    );
    args.push(f.hideUsedFrom, f.hideUsedTo);
  }
  const where = conds.join(' AND ');
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM posts p WHERE ${where}`).get(...args) as { n: number }
  ).n;
  const rows = db
    .prepare(
      `SELECT p.post_id, p.username, p.caption, p.likes, p.topic,
              (SELECT COUNT(*) FROM post_caption_variants v WHERE v.post_id = p.post_id) AS variant_count,
              ${THUMB_FILE('p.post_id')} AS thumb_file
         FROM posts p
        WHERE ${where}
        ORDER BY ${LIKES_NUM} DESC, p.scraped_at DESC, p.post_id
        LIMIT ? OFFSET ?`,
    )
    .all(...args, f.limit, f.offset) as unknown as (Omit<PoolPostRow, 'thumb'> & {
    thumb_file: string | null;
  })[];
  return {
    total,
    items: rows.map(({ thumb_file, ...r }) => ({ ...r, thumb: thumbPath(r.post_id, thumb_file) })),
  };
}

/** 1 bai trong kho (null neu khong con du dieu kien) - kiem tra truoc khi gan tay. */
export function getPoolPost(postId: string): { post_id: string; topic: string } | null {
  return (
    (db
      .prepare(`SELECT p.post_id, p.topic FROM posts p WHERE p.post_id = ? AND ${POOL_COND}`)
      .get(postId) as { post_id: string; topic: string } | undefined) ?? null
  );
}

export interface UsageRow {
  item_id: number;
  plan_id: string;
  post_id: string;
  post_date: string;
  caption_variant: number | null;
  account_name: string;
}

/** Moi lan dung cua cac bai trong khoang ngay [from, to] (moi plan) - phuc vu luat gian ngay. */
export function loadUsageForPosts(postIds: string[], from: string, to: string): UsageRow[] {
  if (postIds.length === 0) return [];
  return db
    .prepare(
      `SELECT id AS item_id, plan_id, post_id, post_date, caption_variant, account_name
         FROM distribution_items
        WHERE post_id IN (${postIds.map(() => '?').join(',')})
          AND post_date BETWEEN ? AND ?
        ORDER BY post_date, id`,
    )
    .all(...postIds, from, to) as unknown as UsageRow[];
}

/** Cac bai (trong danh sach) da co du ban caption viet lai. */
export function postsWithVariantsAmong(postIds: string[]): Set<string> {
  if (postIds.length === 0) return new Set();
  const rows = db
    .prepare(
      `SELECT DISTINCT post_id FROM post_caption_variants
        WHERE post_id IN (${postIds.map(() => '?').join(',')})`,
    )
    .all(...postIds) as { post_id: string }[];
  return new Set(rows.map((r) => r.post_id));
}

/** So lan dung tung ban caption cua 1 bai (key = variant, null = caption goc). */
export function variantUsageOfPost(postId: string): Map<number | null, number> {
  const rows = db
    .prepare(
      `SELECT caption_variant AS v, COUNT(*) AS n FROM distribution_items
        WHERE post_id = ? GROUP BY caption_variant`,
    )
    .all(postId) as unknown as { v: number | null; n: number }[];
  return new Map(rows.map((r) => [r.v, r.n]));
}

export function getPlanItem(planId: string, itemId: number): PlanItemRow | null {
  return (
    (db
      .prepare(
        `SELECT id, plan_id, day_index, slot_index, post_date, account_id, account_name, post_id,
                topic, caption_variant
           FROM distribution_items WHERE id = ? AND plan_id = ?`,
      )
      .get(itemId, planId) as PlanItemRow | undefined) ?? null
  );
}

export function nextSlotIndex(planId: string, accountName: string, dayIndex: number): number {
  const r = db
    .prepare(
      `SELECT COALESCE(MAX(slot_index) + 1, 0) AS n FROM distribution_items
        WHERE plan_id = ? AND account_name = ? AND day_index = ?`,
    )
    .get(planId, accountName, dayIndex) as { n: number };
  return r.n;
}

export function insertItem(it: Omit<PlanItemRow, 'id'>): number {
  const r = insItem.run({ ...it, created_at: new Date().toISOString() });
  return Number(r.lastInsertRowid);
}

export function deleteItem(planId: string, itemId: number): void {
  db.prepare('DELETE FROM distribution_items WHERE id = ? AND plan_id = ?').run(itemId, planId);
}

export function updateItemVariant(planId: string, itemId: number, variant: number | null): void {
  db.prepare('UPDATE distribution_items SET caption_variant = ? WHERE id = ? AND plan_id = ?').run(
    variant,
    itemId,
    planId,
  );
}

/** Tinh lai so lieu tong cua plan tu items (plan thu cong thay doi lien tuc) + moc updated_at. */
export function recomputePlanStats(planId: string): void {
  db.prepare(
    `UPDATE distribution_plans SET
       planned = (SELECT COUNT(*) FROM distribution_items WHERE plan_id = @id),
       assigned = (SELECT COUNT(*) FROM distribution_items WHERE plan_id = @id AND post_id IS NOT NULL),
       shortage = (SELECT COUNT(*) FROM distribution_items WHERE plan_id = @id AND post_id IS NULL),
       account_count = (SELECT COUNT(DISTINCT account_name) FROM distribution_items WHERE plan_id = @id),
       updated_at = @now
     WHERE id = @id`,
  ).run({ id: planId, now: new Date().toISOString() });
}

export interface PlanItemDetail extends PlanItemRow {
  likes: string | null;
  caption: string | null;
  username: string | null;
  variant_count: number;
  thumb: string | null;
}

/** Items kem thong tin bai (like, caption, anh) cho man hinh gan tay / chi tiet ke hoach. */
export function getPlanItemsDetailed(planId: string): PlanItemDetail[] {
  const rows = db
    .prepare(
      `SELECT d.id, d.plan_id, d.day_index, d.slot_index, d.post_date, d.account_id, d.account_name,
              d.post_id, d.topic, d.caption_variant, p.likes, p.caption, p.username,
              (SELECT COUNT(*) FROM post_caption_variants v WHERE v.post_id = d.post_id) AS variant_count,
              ${THUMB_FILE('d.post_id')} AS thumb_file
         FROM distribution_items d
         LEFT JOIN posts p ON p.post_id = d.post_id
        WHERE d.plan_id = ?
        ORDER BY d.day_index, d.slot_index, d.account_name`,
    )
    .all(planId) as unknown as (Omit<PlanItemDetail, 'thumb'> & { thumb_file: string | null })[];
  return rows.map(({ thumb_file, ...r }) => ({ ...r, thumb: thumbPath(r.post_id, thumb_file) }));
}

/** Chay fn trong transaction GHI (BEGIN IMMEDIATE): kiem tra + ghi khong bi chen giua chung. */
export function inWriteTx<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
