import { db } from './index';

// Lich su luot xem bai + ket qua check shadowban tung nick - xem services/shadowbanCheck.ts.

export type ShadowbanVerdict = 'ok' | 'suspect' | 'shadowban' | 'unknown';

export interface ViewSnapshotInput {
  accountName: string;
  postCode: string;
  postUrl: string;
  postedAt: string | null; // ISO UTC
  views: number | null;
  likes: number | null;
  replies: number | null;
}

export interface ViewSnapshot {
  post_code: string;
  post_url: string;
  posted_at: string | null;
  views: number | null;
  likes: number | null;
  replies: number | null;
  checked_at: string;
}

export interface ShadowbanCheckInput {
  accountName: string;
  verdict: ShadowbanVerdict;
  recentMedian: number | null;
  baselineMedian: number | null;
  ratio: number | null;
  profileVisible: boolean | null;
  searchVisible: boolean | null;
  expectedPosts: number | null;
  foundPosts: number | null;
  hiddenPosts: number | null;
  details: unknown; // ly do + loi tung buoc, luu JSON
}

export interface ShadowbanCheck {
  id: number;
  account_name: string;
  checked_at: string;
  verdict: ShadowbanVerdict;
  recent_median: number | null;
  baseline_median: number | null;
  ratio: number | null;
  profile_visible: number | null;
  search_visible: number | null;
  expected_posts: number | null;
  found_posts: number | null;
  hidden_posts: number | null;
  details: string | null;
}

const insSnapshot = db.prepare(`
  INSERT INTO post_view_snapshots
    (account_name, post_code, post_url, posted_at, views, likes, replies, checked_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

export function insertViewSnapshot(s: ViewSnapshotInput, checkedAt: string): void {
  insSnapshot.run(s.accountName, s.postCode, s.postUrl, s.postedAt, s.views, s.likes, s.replies, checkedAt);
}

/** Snapshot MOI NHAT cua tung bai (theo post_code) cua 1 nick - dung lam du lieu so sanh baseline. */
export function latestViewsByPost(accountName: string): ViewSnapshot[] {
  return db
    .prepare(
      `SELECT s.post_code, s.post_url, s.posted_at, s.views, s.likes, s.replies, s.checked_at
         FROM post_view_snapshots s
         JOIN (
           SELECT post_code, MAX(id) AS max_id
             FROM post_view_snapshots
            WHERE account_name = ?
            GROUP BY post_code
         ) m ON m.max_id = s.id
        ORDER BY s.posted_at DESC`,
    )
    .all(accountName) as unknown as ViewSnapshot[];
}

/** Toan bo lich su snapshot cua 1 nick (cho bieu do view theo thoi gian). */
export function viewHistory(accountName: string): ViewSnapshot[] {
  return db
    .prepare(
      `SELECT post_code, post_url, posted_at, views, likes, replies, checked_at
         FROM post_view_snapshots
        WHERE account_name = ?
        ORDER BY checked_at, posted_at`,
    )
    .all(accountName) as unknown as ViewSnapshot[];
}

/**
 * So bai tool auto bao da dang (post_runs) trong khoang [from, to] - chuoi 'YYYY-MM-DD HH:MM:SS'
 * gio dia phuong, cung dinh dang voi post_runs.posted_at.
 */
export function countPostRunsBetween(accountName: string, from: string, to: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM post_runs
        WHERE account_name = ? AND posted_at >= ? AND posted_at <= ?`,
    )
    .get(accountName, from, to) as { n: number };
  return row.n;
}

const insCheck = db.prepare(`
  INSERT INTO account_shadowban_checks
    (account_name, checked_at, verdict, recent_median, baseline_median, ratio, profile_visible,
     search_visible, expected_posts, found_posts, hidden_posts, details)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const toFlag = (v: boolean | null): number | null => (v === null ? null : v ? 1 : 0);

export function insertShadowbanCheck(c: ShadowbanCheckInput, checkedAt: string): void {
  insCheck.run(
    c.accountName,
    checkedAt,
    c.verdict,
    c.recentMedian,
    c.baselineMedian,
    c.ratio,
    toFlag(c.profileVisible),
    toFlag(c.searchVisible),
    c.expectedPosts,
    c.foundPosts,
    c.hiddenPosts,
    JSON.stringify(c.details ?? null),
  );
}

export function listShadowbanChecks(accountName: string, limit = 30): ShadowbanCheck[] {
  return db
    .prepare(
      `SELECT * FROM account_shadowban_checks
        WHERE account_name = ?
        ORDER BY checked_at DESC, id DESC
        LIMIT ?`,
    )
    .all(accountName, limit) as unknown as ShadowbanCheck[];
}
