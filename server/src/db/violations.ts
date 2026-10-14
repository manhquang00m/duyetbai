import { db } from './index';
import { splitPostId } from './postRuns';

// Nick bi Threads go bai vi pham noi dung - tool auto bao ve qua api/automation.ts.

export interface ViolationInput {
  accountName: string;
  detectedAt: string; // 'YYYY-MM-DD HH:MM:SS'
  postId?: string | null;
  postedUrl?: string | null;
  postedAt?: string | null; // 'YYYY-MM-DD'
  message?: string | null;
}

export interface ViolationResult {
  index: number;
  reports: number;
  unknownAccount: boolean;
}

const accountExists = db.prepare('SELECT 1 FROM accounts WHERE name = ?');
const upsertViolation = db.prepare(`
  INSERT INTO account_violations
    (post_date, account_name, post_id, posted_url, posted_at, message, detected_at,
     reports, first_reported_at, last_reported_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  ON CONFLICT(post_date, account_name, post_id) DO UPDATE SET
    posted_url = COALESCE(excluded.posted_url, account_violations.posted_url),
    posted_at = COALESCE(excluded.posted_at, account_violations.posted_at),
    message = COALESCE(excluded.message, account_violations.message),
    detected_at = MAX(excluded.detected_at, account_violations.detected_at),
    reports = account_violations.reports + 1,
    last_reported_at = excluded.last_reported_at,
    -- Tool bao lai sau khi da danh dau go -> vi pham moi, hien lai.
    resolved_at = NULL
`);
const readReports = db.prepare(
  'SELECT reports FROM account_violations WHERE post_date = ? AND account_name = ? AND post_id = ?',
);

export function recordViolations(items: ViolationInput[]): ViolationResult[] {
  const now = new Date().toISOString();
  const out: ViolationResult[] = [];
  db.exec('BEGIN');
  try {
    items.forEach((it, index) => {
      const postDate = it.detectedAt.slice(0, 10);
      const postId = it.postId ? splitPostId(it.postId).postId : '';
      upsertViolation.run(
        postDate,
        it.accountName,
        postId,
        it.postedUrl ?? null,
        it.postedAt ?? null,
        it.message ?? null,
        it.detectedAt,
        now,
        now,
      );
      const { reports } = readReports.get(postDate, it.accountName, postId) as { reports: number };
      out.push({ index, reports, unknownAccount: !accountExists.get(it.accountName) });
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return out;
}

export interface ViolationRow {
  id: number;
  account_name: string;
  appeal_status: string | null;
  post_id: string; // '' = khong ro bai
  posted_url: string | null;
  posted_at: string | null; // 'YYYY-MM-DD'
  message: string | null;
  detected_at: string;
  reports: number;
  caption: string | null;
}

// Tran tren so dong de UI khong phinh khi bang lon dan theo thoi gian.
const MAX_ROWS = 500;
const listAll = db.prepare(`
  SELECT v.id, v.account_name,
         (SELECT a.appeal_status FROM accounts a WHERE a.name = v.account_name) AS appeal_status,
         v.post_id, v.posted_url, v.posted_at, v.message, v.detected_at, v.reports, p.caption
    FROM account_violations v
    LEFT JOIN posts p ON p.post_id = v.post_id
   WHERE v.resolved_at IS NULL
   ORDER BY v.detected_at DESC
   LIMIT ${MAX_ROWS}
`);

export function listViolations(): ViolationRow[] {
  return listAll.all() as unknown as ViolationRow[];
}

const markResolved = db.prepare(
  'UPDATE account_violations SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL',
);

/** false = khong co vi pham dang mo voi id nay (khong ton tai / da go roi). */
export function resolveViolation(id: number): boolean {
  return Number(markResolved.run(new Date().toISOString(), id).changes) > 0;
}
