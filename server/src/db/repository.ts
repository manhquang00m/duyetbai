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

const assignAccount = db.prepare(
  "UPDATE posts SET assigned_account = ?, post_status = 'exported', exported_at = ? WHERE post_id = ?",
);
const touchExported = db.prepare(
  "UPDATE posts SET post_status = CASE WHEN post_status = 'new' THEN 'exported' ELSE post_status END, exported_at = ? WHERE post_id = ?",
);
const markPosted = db.prepare("UPDATE posts SET post_status = 'posted', posted_at = ? WHERE post_id = ?");
const markUnposted = db.prepare(
  "UPDATE posts SET post_status = 'exported', posted_at = NULL WHERE post_id = ?",
);

/** Gan account co dinh cho 1 bai khi export lan dau (khong doi lai o cac lan export sau). */
export function assignAccountAndMarkExported(postId: string, account: string): void {
  assignAccount.run(account, new Date().toISOString(), postId);
}

/** Bai da co assigned_account tu truoc -> chi cap nhat lai thoi gian xuat gan nhat. */
export function touchExportedAt(postId: string): void {
  touchExported.run(new Date().toISOString(), postId);
}

/** Danh dau (hoac bo danh dau) da dang bai - nguoi dung tu xac nhan sau khi dang qua tool ben ngoai. */
export function markPostsPosted(postIds: string[], posted: boolean): void {
  const now = new Date().toISOString();
  for (const id of postIds) {
    if (posted) markPosted.run(now, id);
    else markUnposted.run(id);
  }
}

const updateLinkStatus = db.prepare(
  `UPDATE shopee_entries
   SET link_status = ?, link_message = ?, link_checked_at = ?, product_title = ?, product_image = ?
   WHERE id = ?`,
);

/** Luu ket qua kiem tra 1 link Shopee (con hang/het hang/khong ton tai + ten/anh san pham neu co). */
export function setShopeeLinkStatus(
  entryId: number,
  status: string,
  message: string,
  productTitle?: string,
  productImage?: string,
): void {
  updateLinkStatus.run(
    status,
    message,
    new Date().toISOString(),
    productTitle ?? null,
    productImage ?? null,
    entryId,
  );
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
