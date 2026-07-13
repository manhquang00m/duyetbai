import { db } from './index';

export interface CollectHistoryRow {
  id: number;
  url: string;
  post_id: string | null;
  ok: number;
  skipped: number;
  error: string | null;
  attempted_at: string;
}

export interface RecordAttemptInput {
  url: string;
  postId: string | null;
  ok: boolean;
  skipped?: boolean;
  error?: string | null;
}

const upsert = db.prepare(`
  INSERT INTO collect_history (url, post_id, ok, skipped, error, attempted_at)
  VALUES (@url, @postId, @ok, @skipped, @error, @attemptedAt)
  ON CONFLICT(url) DO UPDATE SET
    post_id      = excluded.post_id,
    ok           = excluded.ok,
    skipped      = excluded.skipped,
    error        = excluded.error,
    attempted_at = excluded.attempted_at
`);

/** Ghi lai 1 lan thu thu thap cho 1 URL (upsert theo url -> giu trang thai lan gan nhat). */
export function recordCollectAttempt(input: RecordAttemptInput): void {
  upsert.run({
    url: input.url,
    postId: input.postId,
    ok: input.ok ? 1 : 0,
    skipped: input.skipped ? 1 : 0,
    error: input.error ?? null,
    attemptedAt: new Date().toISOString(),
  });
}

/** Lich su thu thap, moi nhat truoc. onlyFailed: chi lay cac URL dang loi (ok=0). */
export function listCollectHistory(opts: { onlyFailed?: boolean } = {}): CollectHistoryRow[] {
  const where = opts.onlyFailed ? 'WHERE ok = 0' : '';
  return db
    .prepare(`SELECT * FROM collect_history ${where} ORDER BY attempted_at DESC`)
    .all() as CollectHistoryRow[];
}

export function removeCollectHistory(id: number): void {
  db.prepare('DELETE FROM collect_history WHERE id = ?').run(id);
}
