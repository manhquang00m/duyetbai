import { db } from './index';

// Nhat ky dang bai do tool auto bao ve (api/automation.ts) + doi chieu voi lich Phan phoi bai.

export type PostRunStatus = 'posted' | 'commented';

export interface PostRunInput {
  accountName: string;
  postId: string; // dung nhu cot POST_ID trong file xuat: "<post_id>" hoac "<post_id>-v<N>"
  postDate: string; // 'YYYY-MM-DD'
  status: PostRunStatus;
  postedUrl?: string | null;
  postedAt?: string | null; // 'YYYY-MM-DD HH:MM:SS'
}

export interface PostRunResult {
  index: number;
  status: PostRunStatus; // trang thai SAU khi ghi (co the giu 'commented' neu lan nay gui 'posted')
  matchedPlan: boolean; // khop 1 slot trong ke hoach phan phoi
  unknownAccount: boolean;
  unknownPost: boolean;
}

const postExists = db.prepare('SELECT 1 FROM posts WHERE post_id = ?');
const accountExists = db.prepare('SELECT 1 FROM accounts WHERE name = ?');
const findSlot = db.prepare(
  `SELECT id, caption_variant FROM distribution_items
    WHERE post_date = ? AND account_name = ? AND post_id = ? LIMIT 1`,
);
const upsertRun = db.prepare(`
  INSERT INTO post_runs
    (post_date, account_name, post_id, caption_variant, dist_item_id, status, posted_url, posted_at,
     reports, first_reported_at, last_reported_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  ON CONFLICT(post_date, account_name, post_id) DO UPDATE SET
    -- Chi NANG trang thai: tool retry/gui lai 'posted' sau khi da bao 'commented' khong duoc ha xuong.
    status = CASE WHEN post_runs.status = 'commented' THEN 'commented' ELSE excluded.status END,
    posted_url = COALESCE(excluded.posted_url, post_runs.posted_url),
    posted_at = COALESCE(excluded.posted_at, post_runs.posted_at),
    caption_variant = COALESCE(excluded.caption_variant, post_runs.caption_variant),
    dist_item_id = COALESCE(excluded.dist_item_id, post_runs.dist_item_id),
    reports = post_runs.reports + 1,
    last_reported_at = excluded.last_reported_at
`);
const readStatus = db.prepare(
  'SELECT status FROM post_runs WHERE post_date = ? AND account_name = ? AND post_id = ?',
);

/**
 * Tach POST_ID cua file xuat ve (post_id, ban caption). Uu tien khop NGUYEN chuoi voi bang posts
 * (shortcode Threads co the chua '-'), chi cat hau to "-vN" khi nguyen chuoi khong phai 1 bai.
 */
export function splitPostId(raw: string): { postId: string; variant: number | null } {
  if (postExists.get(raw)) return { postId: raw, variant: null };
  const m = raw.match(/^(.+)-v(\d{1,2})$/);
  if (m) return { postId: m[1], variant: Number(m[2]) };
  return { postId: raw, variant: null };
}

export function recordPostRuns(items: PostRunInput[]): PostRunResult[] {
  const now = new Date().toISOString();
  const out: PostRunResult[] = [];
  db.exec('BEGIN');
  try {
    items.forEach((it, index) => {
      const { postId, variant } = splitPostId(it.postId);
      const slot = findSlot.get(it.postDate, it.accountName, postId) as
        | { id: number; caption_variant: number | null }
        | undefined;
      upsertRun.run(
        it.postDate,
        it.accountName,
        postId,
        variant ?? slot?.caption_variant ?? null,
        slot?.id ?? null,
        it.status,
        it.postedUrl ?? null,
        it.postedAt ?? null,
        now,
        now,
      );
      const final = (readStatus.get(it.postDate, it.accountName, postId) as { status: PostRunStatus })
        .status;
      out.push({
        index,
        status: final,
        matchedPlan: !!slot,
        unknownAccount: !accountExists.get(it.accountName),
        unknownPost: !postExists.get(postId),
      });
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return out;
}

export type SlotState = PostRunStatus | 'missing';

export interface DayRow {
  account_name: string;
  appeal_status: string | null; // trang thai account (accounts.appeal_status), null = chua dat / nick la
  post_id: string;
  caption_variant: number | null;
  plan_name: string | null; // null = bai dang ngoai ke hoach
  in_plan: boolean;
  state: SlotState;
  posted_url: string | null;
  posted_at: string | null;
  reports: number;
  last_reported_at: string | null;
  caption: string | null;
  thumb: string | null;
}

const THUMB_COLS = `
  (SELECT file FROM media m WHERE m.post_id = p.post_id AND m.type = 'image' AND m.ok = 1
     ORDER BY id LIMIT 1) AS thumb_file,
  (SELECT file FROM media m WHERE m.post_id = p.post_id AND m.ok = 1 ORDER BY id LIMIT 1) AS any_file`;

interface RawDayRow extends Omit<DayRow, 'in_plan' | 'state' | 'thumb'> {
  status: PostRunStatus | null;
  thumb_file: string | null;
  any_file: string | null;
}

const toDayRow = (r: RawDayRow, inPlan: boolean): DayRow => {
  const file = r.thumb_file ?? r.any_file;
  return {
    account_name: r.account_name,
    appeal_status: r.appeal_status,
    post_id: r.post_id,
    caption_variant: r.caption_variant,
    plan_name: r.plan_name,
    in_plan: inPlan,
    state: r.status ?? 'missing',
    posted_url: r.posted_url,
    posted_at: r.posted_at,
    reports: r.reports ?? 0,
    last_reported_at: r.last_reported_at,
    caption: r.caption,
    thumb: file ? `post_${r.post_id}/${file}` : null,
  };
};

/** Toan bo slot theo lich cua 1 ngay (kem ket qua da bao) + bai dang ngoai ke hoach ngay do. */
export function dayReport(date: string): DayRow[] {
  const planned = db
    .prepare(
      `SELECT d.account_name,
              (SELECT a.appeal_status FROM accounts a WHERE a.name = d.account_name) AS appeal_status,
              d.post_id, d.caption_variant,
              COALESCE(pl.name, 'Kế hoạch ' || substr(pl.id, 1, 8)) AS plan_name,
              r.status, r.posted_url, r.posted_at, r.reports, r.last_reported_at,
              p.caption, ${THUMB_COLS}
         FROM distribution_items d
         JOIN distribution_plans pl ON pl.id = d.plan_id
         LEFT JOIN post_runs r
           ON r.post_date = d.post_date AND r.account_name = d.account_name AND r.post_id = d.post_id
         LEFT JOIN posts p ON p.post_id = d.post_id
        WHERE d.post_date = ? AND d.post_id IS NOT NULL
        ORDER BY d.account_name, d.slot_index`,
    )
    .all(date) as unknown as RawDayRow[];
  const extra = db
    .prepare(
      `SELECT r.account_name,
              (SELECT a.appeal_status FROM accounts a WHERE a.name = r.account_name) AS appeal_status,
              r.post_id, r.caption_variant, NULL AS plan_name,
              r.status, r.posted_url, r.posted_at, r.reports, r.last_reported_at,
              p.caption, ${THUMB_COLS}
         FROM post_runs r
         LEFT JOIN posts p ON p.post_id = r.post_id
        WHERE r.post_date = ?
          AND NOT EXISTS (
            SELECT 1 FROM distribution_items d
             WHERE d.post_date = r.post_date AND d.account_name = r.account_name AND d.post_id = r.post_id
          )
        ORDER BY r.account_name`,
    )
    .all(date) as unknown as RawDayRow[];
  return [...planned.map((r) => toDayRow(r, true)), ...extra.map((r) => toDayRow(r, false))];
}

export interface AccountRangeRow {
  account_name: string;
  appeal_status: string | null;
  planned: number;
  commented: number;
  posted_only: number; // dang duoc nhung THIEU comment (= thieu link affiliate)
  missing: number; // theo lich nhung chua bao cao
  extra: number; // bao cao ngoai ke hoach
}

/** Tong hop theo nick trong khoang ngay - de thay nick nao hay thieu comment / khong chay. */
export function accountRange(from: string, to: string): AccountRangeRow[] {
  const planned = db
    .prepare(
      `SELECT d.account_name,
              COUNT(*) AS planned,
              SUM(CASE WHEN r.status = 'commented' THEN 1 ELSE 0 END) AS commented,
              SUM(CASE WHEN r.status = 'posted' THEN 1 ELSE 0 END) AS posted_only,
              SUM(CASE WHEN r.status IS NULL THEN 1 ELSE 0 END) AS missing
         FROM distribution_items d
         LEFT JOIN post_runs r
           ON r.post_date = d.post_date AND r.account_name = d.account_name AND r.post_id = d.post_id
        WHERE d.post_date >= ? AND d.post_date <= ? AND d.post_id IS NOT NULL
        GROUP BY d.account_name`,
    )
    .all(from, to) as unknown as Omit<AccountRangeRow, 'extra' | 'appeal_status'>[];
  const extra = db
    .prepare(
      `SELECT r.account_name, COUNT(*) AS n,
              SUM(CASE WHEN r.status = 'commented' THEN 1 ELSE 0 END) AS commented,
              SUM(CASE WHEN r.status = 'posted' THEN 1 ELSE 0 END) AS posted_only
         FROM post_runs r
        WHERE r.post_date >= ? AND r.post_date <= ?
          AND NOT EXISTS (
            SELECT 1 FROM distribution_items d
             WHERE d.post_date = r.post_date AND d.account_name = r.account_name AND d.post_id = r.post_id
          )
        GROUP BY r.account_name`,
    )
    .all(from, to) as unknown as { account_name: string; n: number; commented: number; posted_only: number }[];

  const statusOf = new Map(
    (db.prepare('SELECT name, appeal_status FROM accounts').all() as { name: string; appeal_status: string | null }[]).map(
      (a) => [a.name, a.appeal_status],
    ),
  );
  const m = new Map<string, AccountRangeRow>();
  for (const r of planned)
    m.set(r.account_name, { ...r, appeal_status: statusOf.get(r.account_name) ?? null, extra: 0 });
  for (const r of extra) {
    const e =
      m.get(r.account_name) ??
      {
        account_name: r.account_name,
        appeal_status: statusOf.get(r.account_name) ?? null,
        planned: 0,
        commented: 0,
        posted_only: 0,
        missing: 0,
        extra: 0,
      };
    e.extra = r.n;
    e.commented += r.commented;
    e.posted_only += r.posted_only;
    m.set(r.account_name, e);
  }
  return [...m.values()].sort(
    (a, b) => b.missing + b.posted_only - (a.missing + a.posted_only) || a.account_name.localeCompare(b.account_name),
  );
}
