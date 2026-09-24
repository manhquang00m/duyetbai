import { db } from './index';
import { CLEAN_POST_COND, HAS_VIDEO, HAS_IMAGE } from './queries';

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
 * Kho bai du dieu kien phan phoi: bai SACH (CLEAN_POST_COND), CO media tai duoc, va tac gia
 * DA duoc gan chu de - khong co chu de thi khong biet phat cho account nao.
 * Vế media tranh xuat ra dong co ca VideoPath lan ImagePath rong cho tool auto dang.
 */
export function listCleanPostsWithTopic(filter: CleanPoolFilter = {}): CleanPost[] {
  const conds = [CLEAN_POST_COND, `(${HAS_VIDEO} OR ${HAS_IMAGE})`, 't.topic IS NOT NULL'];
  const args: string[] = [];
  if (filter.topics && filter.topics.length > 0) {
    conds.push(`t.topic IN (${filter.topics.map(() => '?').join(',')})`);
    args.push(...filter.topics);
  }
  const scraped = scrapedDateConds(filter);
  conds.push(...scraped.conds);
  args.push(...scraped.args);
  return db
    .prepare(
      `SELECT p.post_id AS post_id, t.topic AS topic
         FROM posts p
         LEFT JOIN account_topics t ON t.username = p.username
        WHERE ${conds.join(' AND ')}
        ORDER BY p.post_id`,
    )
    .all(...args) as unknown as CleanPost[];
}

/** Dem bai sach theo tung chu de - cho the "Kho bai" tren UI. */
export function cleanPoolByTopic(
  filter: Pick<CleanPoolFilter, 'scrapedFrom' | 'scrapedTo'> = {},
): Record<string, number> {
  const conds = [CLEAN_POST_COND, `(${HAS_VIDEO} OR ${HAS_IMAGE})`, 't.topic IS NOT NULL'];
  const args: string[] = [];
  const scraped = scrapedDateConds(filter);
  conds.push(...scraped.conds);
  args.push(...scraped.args);
  const rows = db
    .prepare(
      `SELECT t.topic AS topic, COUNT(*) AS n
         FROM posts p
         LEFT JOIN account_topics t ON t.username = p.username
        WHERE ${conds.join(' AND ')}
        GROUP BY t.topic`,
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
    noTopic: n('NOT EXISTS (SELECT 1 FROM account_topics t WHERE t.username = p.username)'),
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
