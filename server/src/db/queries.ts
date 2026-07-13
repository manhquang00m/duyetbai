import { db } from './index';

export interface PostListItem {
  post_id: string;
  url: string;
  username: string;
  caption: string;
  likes: string;
  comments: string;
  views: string;
  post_date: string;
  scraped_at: string;
  scrape_error: string | null;
  media_count: number;
  shopee_count: number; // so link da luu (1 comment nhieu link -> nhieu dong)
  distinct_comment_count: number; // so comment THUC su khac nhau (dung de hien thi "X cmt shopee")
  new_count: number; // so link shopee da co new_link (da update)
  shopee_comment_count: number | null; // so comment (chu bai) co link shopee - lay tu scrape, co the lech neu re-scrape chua chay
  comment: string | null; // comment shopee dau tien (ngan gon)
  thumb: string | null; // duong dan tuong doi trong /media, vd post_X/img/image.jpg
  assigned_account: string | null; // account co dinh se dung khi xuat posts.xlsx
  post_status: string; // 'new' | 'exported' | 'posted'
  exported_at: string | null;
  posted_at: string | null;
}

const SELECT_LIST = `
  SELECT p.post_id, p.url, p.username, p.caption, p.likes, p.comments, p.views,
         p.post_date, p.scraped_at, p.scrape_error, p.shopee_comment_count,
         p.assigned_account, p.post_status, p.exported_at, p.posted_at,
         (SELECT COUNT(*) FROM media m WHERE m.post_id = p.post_id) AS media_count,
         (SELECT COUNT(*) FROM shopee_entries s WHERE s.post_id = p.post_id) AS shopee_count,
         (SELECT COUNT(DISTINCT comment) FROM shopee_entries s WHERE s.post_id = p.post_id) AS distinct_comment_count,
         (SELECT COUNT(*) FROM shopee_entries s WHERE s.post_id = p.post_id
            AND s.new_link IS NOT NULL AND s.new_link <> '') AS new_count,
         (SELECT comment FROM shopee_entries s WHERE s.post_id = p.post_id
            ORDER BY id LIMIT 1) AS comment,
         (SELECT file FROM media m WHERE m.post_id = p.post_id AND m.type = 'image' AND m.ok = 1
            ORDER BY id LIMIT 1) AS thumb_file,
         (SELECT file FROM media m WHERE m.post_id = p.post_id AND m.ok = 1
            ORDER BY id LIMIT 1) AS any_file
    FROM posts p
`;

export function listPosts(
  opts: {
    search?: string;
    limit?: number;
    offset?: number;
    noShopee?: boolean;
    notUpdated?: boolean;
    oneShopee?: boolean;
    postStatus?: 'new' | 'exported' | 'posted';
  } = {},
): {
  total: number;
  items: PostListItem[];
} {
  const search = (opts.search ?? '').trim();
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  const conds: string[] = [];
  const args: unknown[] = [];
  if (search) {
    conds.push('(p.caption LIKE ? OR p.username LIKE ? OR p.post_id LIKE ?)');
    args.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (opts.noShopee) {
    conds.push('NOT EXISTS (SELECT 1 FROM shopee_entries s WHERE s.post_id = p.post_id)');
  }
  if (opts.notUpdated) {
    conds.push(
      "EXISTS (SELECT 1 FROM shopee_entries s WHERE s.post_id = p.post_id AND (s.new_link IS NULL OR s.new_link = ''))",
    );
  }
  if (opts.oneShopee) {
    conds.push('p.shopee_comment_count = 1');
  }
  if (opts.postStatus) {
    conds.push('p.post_status = ?');
    args.push(opts.postStatus);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM posts p ${where}`).get(...args) as { n: number }
  ).n;

  const rows = db
    .prepare(`${SELECT_LIST} ${where} ORDER BY p.scraped_at DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, offset) as (Omit<PostListItem, 'thumb'> & {
    thumb_file: string | null;
    any_file: string | null;
  })[];

  const items: PostListItem[] = rows.map((r) => {
    const file = r.thumb_file ?? r.any_file;
    const { thumb_file, any_file, ...rest } = r;
    return { ...rest, thumb: file ? `post_${r.post_id}/${file}` : null };
  });

  return { total, items };
}

export interface MediaRow {
  type: string;
  file: string;
  ok: number;
  error: string | null;
  url: string; // /media/... de client phat truc tiep
  processedUrl?: string | null; // ban da "lam dep" (neu co)
}

export interface ShopeeRow {
  comment: string;
  link: string;
  new_link: string | null;
}

export function getPostDetail(postId: string) {
  const post = db.prepare('SELECT * FROM posts WHERE post_id = ?').get(postId) as
    | Record<string, unknown>
    | undefined;
  if (!post) return null;

  const media = (
    db
      .prepare('SELECT type, file, ok, error, processed_file FROM media WHERE post_id = ? ORDER BY id')
      .all(postId) as {
      type: string;
      file: string;
      ok: number;
      error: string | null;
      processed_file: string | null;
    }[]
  ).map((m) => {
    const { processed_file, ...rest } = m;
    return {
      ...rest,
      url: `/media/post_${postId}/${m.file}`,
      processedUrl: processed_file ? `/media/post_${postId}/${processed_file}` : null,
    };
  });

  const shopee = db
    .prepare('SELECT comment, link, new_link FROM shopee_entries WHERE post_id = ? ORDER BY id')
    .all(postId) as ShopeeRow[];

  return { post, media, shopee };
}

export function getStats() {
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    posts: n('SELECT COUNT(*) AS n FROM posts'),
    media: n('SELECT COUNT(*) AS n FROM media WHERE ok = 1'),
    shopee: n('SELECT COUNT(*) AS n FROM shopee_entries'),
    accounts: n('SELECT COUNT(*) AS n FROM accounts WHERE active = 1'),
  };
}

/**
 * Canh bao truoc khi xuat posts.xlsx:
 * - notUpdated: bai co link shopee nhung chua duoc cap nhat link moi (new_link trong)
 * - multiComment: bai co > 1 comment (cua tac gia) chua link shopee -> file chi xuat 1 comment
 *   (comment som nhat), co the sot link cua cac comment con lai.
 */
export function getExportWarnings(): { notUpdated: number; multiComment: number } {
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    notUpdated: n(`
      SELECT COUNT(*) AS n FROM posts p
       WHERE EXISTS (
         SELECT 1 FROM shopee_entries s
          WHERE s.post_id = p.post_id AND (s.new_link IS NULL OR s.new_link = '')
       )
    `),
    multiComment: n('SELECT COUNT(*) AS n FROM posts WHERE shopee_comment_count > 1'),
  };
}

/** Bai da co trong DB chua (dedup theo post_id). */
export function postExists(postId: string): boolean {
  return !!db.prepare('SELECT 1 FROM posts WHERE post_id = ?').get(postId);
}

/** Xoa 1 bai (FK ON DELETE CASCADE tu xoa media + shopee_entries). */
export function deletePost(postId: string): void {
  db.prepare('DELETE FROM posts WHERE post_id = ?').run(postId);
}

export interface VideoMediaRow {
  id: number;
  post_id: string;
  file: string; // duong dan tuong doi trong post_<id>/, vd videos/xxx.mp4
  username: string;
}

/** Lay toan bo video (media.type='video', ok=1) cua danh sach bai -> dung cho job "lam dep video". */
export function getVideoMedia(postIds: string[]): VideoMediaRow[] {
  if (postIds.length === 0) return [];
  const placeholders = postIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT m.id, m.post_id, m.file, p.username
         FROM media m JOIN posts p ON p.post_id = m.post_id
        WHERE m.type = 'video' AND m.ok = 1 AND m.post_id IN (${placeholders})
        ORDER BY m.id`,
    )
    .all(...postIds) as VideoMediaRow[];
}

/** Thong tin ngan cho item "da tai roi" + rescrape. */
export function getPostBrief(
  postId: string,
): { url: string; username: string; caption: string; shopee_count: number } | null {
  const row = db.prepare('SELECT url, username, caption FROM posts WHERE post_id = ?').get(postId) as
    | { url: string; username: string; caption: string }
    | undefined;
  if (!row) return null;
  const n = (
    db.prepare('SELECT COUNT(*) AS n FROM shopee_entries WHERE post_id = ?').get(postId) as {
      n: number;
    }
  ).n;
  return { url: row.url, username: row.username, caption: row.caption, shopee_count: n };
}
