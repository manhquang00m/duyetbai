import { db } from './index';
import type { PostResult } from '../services/pipeline';

const upsertPost = db.prepare(`
  INSERT INTO posts (post_id, url, username, title, caption, likes, comments, views, post_date, scrape_error, shopee_comment_count, scraped_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(post_id) DO UPDATE SET
    url                  = excluded.url,
    username             = excluded.username,
    title                = excluded.title,
    caption              = excluded.caption,
    likes                = excluded.likes,
    comments             = excluded.comments,
    views                = excluded.views,
    post_date            = excluded.post_date,
    scrape_error         = excluded.scrape_error,
    shopee_comment_count = excluded.shopee_comment_count,
    scraped_at           = excluded.scraped_at
`);

const delMedia = db.prepare('DELETE FROM media WHERE post_id = ?');
const insMedia = db.prepare(
  'INSERT INTO media (post_id, type, file, ok, error) VALUES (?, ?, ?, ?, ?)',
);

const delEntries = db.prepare('DELETE FROM shopee_entries WHERE post_id = ?');
const insEntry = db.prepare(
  'INSERT OR IGNORE INTO shopee_entries (post_id, comment, link) VALUES (?, ?, ?)',
);

const updateScrape = db.prepare(
  'UPDATE posts SET post_date = ?, scrape_error = ?, shopee_comment_count = ? WHERE post_id = ?',
);

const updateProcessedFile = db.prepare('UPDATE media SET processed_file = ? WHERE id = ?');

/** Luu duong dan file video da "lam dep" (watermark/filter/crop/toc do) cho 1 media. */
export function setProcessedFile(mediaId: number, processedFile: string): void {
  updateProcessedFile.run(processedFile, mediaId);
}

/** Chi cap nhat comment/postDate cua 1 bai (nut "Lay lai comment"). */
export function saveScrape(
  postId: string,
  postDate: string,
  entries: { comment: string; link: string }[],
  shopeeCommentCount: number,
  scrapeError?: string,
): void {
  db.exec('BEGIN');
  try {
    updateScrape.run(postDate || null, scrapeError ?? null, shopeeCommentCount, postId);
    delEntries.run(postId);
    for (const e of entries) insEntry.run(postId, e.comment, e.link);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Luu 1 bai (post + media + shopee_entries) trong 1 transaction.
 * Idempotent: chay lai cung URL se cap nhat, khong nhan ban.
 */
export function savePostResult(r: PostResult): void {
  db.exec('BEGIN');
  try {
    upsertPost.run(
      r.postId,
      r.url,
      r.username,
      r.title ?? null,
      r.caption,
      r.stats.likes,
      r.stats.comments,
      r.stats.views,
      r.postDate,
      r.scrapeError ?? null,
      r.shopeeCommentCount,
      new Date().toISOString(),
    );

    delMedia.run(r.postId);
    for (const f of r.files) {
      insMedia.run(r.postId, f.type, f.file, f.ok ? 1 : 0, f.error ?? null);
    }

    delEntries.run(r.postId);
    for (const e of r.entries) {
      insEntry.run(r.postId, e.comment, e.link);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
