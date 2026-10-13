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
  dead_link_count: number; // so link da kiem tra va thay khong con ton tai
  oos_link_count: number; // so link con song nhung san pham het hang
  unknown_link_count: number; // so link kiem tra khong ra ket luan (Shopee chan) -> can xem lai
  checked_link_count: number; // so link da kiem tra (bat ke ket qua)
  shopee_comment_count: number | null; // so comment (chu bai) co link shopee - lay tu scrape, co the lech neu re-scrape chua chay
  comment: string | null; // comment shopee dau tien (ngan gon)
  thumb: string | null; // duong dan tuong doi trong /media, vd post_X/img/image.jpg
  assigned_account: string | null; // account co dinh se dung khi xuat posts.xlsx
  post_status: string; // 'new' | 'exported' | 'posted'
  exported_at: string | null;
  posted_at: string | null;
  topic: string | null; // chu de cua CHINH bai nay (cot posts.topic)
  variant_count: number; // so ban caption AI da viet lai (0..3), xem post_caption_variants
  click_count: number; // so click affiliate khop bai nay (aff_clicks.post_id)
  posted_count: number; // so lan bai da dang thanh cong (post_runs: posted + commented)
}

export type PostSort = 'newest' | 'likes' | 'clicks' | 'posted';

// Allowlist ORDER BY - khong bao gio noi chuoi gia tri tu client vao SQL.
// likes luu dang chuoi ('261', '3.2K', '1,5K') -> quy ve so; rong/NULL xuong cuoi (-1).
const LIKES_NUM = `(CASE
  WHEN p.likes IS NULL OR TRIM(p.likes) = '' THEN -1
  WHEN UPPER(p.likes) LIKE '%K' THEN CAST(REPLACE(REPLACE(REPLACE(p.likes, 'K', ''), 'k', ''), ',', '.') AS REAL) * 1000
  WHEN UPPER(p.likes) LIKE '%M' THEN CAST(REPLACE(REPLACE(REPLACE(p.likes, 'M', ''), 'm', ''), ',', '.') AS REAL) * 1000000
  ELSE CAST(REPLACE(p.likes, ',', '') AS REAL)
END)`;

const ORDER_BY: Record<PostSort, string> = {
  newest: 'p.scraped_at DESC',
  likes: `${LIKES_NUM} DESC, p.scraped_at DESC`,
  clicks: 'click_count DESC, p.scraped_at DESC',
  posted: 'posted_count DESC, p.scraped_at DESC',
};

// Dieu kien "co it nhat 1 file video/anh tai thanh cong" cho 1 bai - dung chung cho filter danh
// sach (listPosts) va filter khi xuat file (exporter.ts).
export const HAS_VIDEO = "EXISTS (SELECT 1 FROM media m WHERE m.post_id = p.post_id AND m.type = 'video' AND m.ok = 1)";
export const HAS_IMAGE = "EXISTS (SELECT 1 FROM media m WHERE m.post_id = p.post_id AND m.type = 'image' AND m.ok = 1)";

/**
 * Bai "SACH" - du dieu kien dem di phan phoi: co it nhat 1 link Shopee, VA moi link deu vua
 * (a) da kiem tra ra 'available' vua (b) da co new_link.
 *
 * Ve (b) BAT BUOC phai co, dung bo di cho gon: buildComment() fallback ve link GOC khi thieu
 * new_link (services/postExportFields.ts), nen bai lot qua se duoc dang bang link KHONG CO
 * affiliate - mat tien ma khong ai biet.
 */
export const CLEAN_POST_COND = `(
  EXISTS (SELECT 1 FROM shopee_entries s WHERE s.post_id = p.post_id)
  AND NOT EXISTS (
    SELECT 1 FROM shopee_entries s
     WHERE s.post_id = p.post_id
       AND (s.link_status IS NULL OR s.link_status <> 'available'
            OR s.new_link IS NULL OR s.new_link = '')
  )
)`;

/**
 * Bo loc DUNG CHUNG cho danh sach bai (listPosts) VA xuat file (exportPosts/getExportWarnings) -
 * dam bao "loc the nao, xuat y nhu the" (1 nguon su that duy nhat cho dieu kien loc).
 */
export const MEDIA_FILTERS = ['complete', 'missing', 'imageOnly', 'videoOnly'] as const;
export type MediaFilter = (typeof MEDIA_FILTERS)[number];

export interface PostFilterOpts {
  search?: string;
  username?: string; // dung CHINH XAC 1 tac gia (khac search: search la LIKE nen de dinh nham)
  noShopee?: boolean;
  notUpdated?: boolean;
  oneShopee?: boolean;
  postStatus?: 'unposted' | 'posted';
  mediaFilter?: MediaFilter;
  topics?: string[]; // loc theo chu de cua bai (posts.topic) - chon nhieu (OR)
  linkStatus?: LinkStatusFilter; // loc theo tinh trang link Shopee da kiem tra
  cleanOnly?: boolean; // chi bai du dieu kien phan phoi, xem CLEAN_POST_COND
  rewritten?: 'yes' | 'no'; // da/chua du 3 ban caption AI, xem post_caption_variants
  scrapedFrom?: string; // 'YYYY-MM-DD' - loc theo scraped_at (thoi diem THU THAP), khong phai post_date
  scrapedTo?: string; // 'YYYY-MM-DD', bao gom ca ngay nay
}

/**
 * Loc bai theo ket qua kiem tra link Shopee. Deu la "co IT NHAT 1 link o trang thai do",
 * vi 1 bai co the co nhieu link - chi can 1 link hong la bai do can xem lai.
 */
export type LinkStatusFilter = 'bad' | 'dead' | 'out_of_stock' | 'review' | 'unchecked';

/**
 * Gia tri dac biet trong PostFilterOpts.topics de loc bai CHUA duoc gan chu de (p.topic rong/null).
 * PHAI khop voi UNASSIGNED_TOPIC o client/src/lib/api.ts.
 */
export const UNASSIGNED_TOPIC = '__unassigned__';

const LINK_STATUS_CONDS: Record<LinkStatusFilter, string> = {
  bad: "s.link_status IN ('dead', 'out_of_stock')",
  dead: "s.link_status = 'dead'",
  out_of_stock: "s.link_status = 'out_of_stock'",
  review: "s.link_status = 'unknown'",
  unchecked: 's.link_status IS NULL',
};

export function buildPostFilterConds(opts: PostFilterOpts): { conds: string[]; args: unknown[] } {
  const conds: string[] = [];
  const args: unknown[] = [];
  const search = (opts.search ?? '').trim();
  if (search) {
    conds.push('(p.caption LIKE ? OR p.username LIKE ? OR p.post_id LIKE ?)');
    args.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const username = (opts.username ?? '').trim();
  if (username) {
    conds.push('p.username = ?');
    args.push(username);
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
  if (opts.postStatus === 'posted') {
    conds.push("p.post_status = 'posted'");
  } else if (opts.postStatus === 'unposted') {
    conds.push("p.post_status <> 'posted'");
  }
  if (opts.mediaFilter === 'complete') {
    conds.push(`(${HAS_VIDEO} AND ${HAS_IMAGE})`);
  } else if (opts.mediaFilter === 'missing') {
    conds.push(`NOT (${HAS_VIDEO} AND ${HAS_IMAGE})`);
  } else if (opts.mediaFilter === 'imageOnly') {
    conds.push(`(${HAS_IMAGE} AND NOT ${HAS_VIDEO})`);
  } else if (opts.mediaFilter === 'videoOnly') {
    conds.push(`(${HAS_VIDEO} AND NOT ${HAS_IMAGE})`);
  }
  if (opts.linkStatus) {
    conds.push(
      `EXISTS (SELECT 1 FROM shopee_entries s WHERE s.post_id = p.post_id AND ${LINK_STATUS_CONDS[opts.linkStatus]})`,
    );
  }
  if (opts.topics && opts.topics.length > 0) {
    const real = opts.topics.filter((t) => t !== UNASSIGNED_TOPIC);
    const wantsUnassigned = opts.topics.includes(UNASSIGNED_TOPIC);
    const subConds: string[] = [];
    if (real.length > 0) {
      subConds.push(`p.topic IN (${real.map(() => '?').join(', ')})`);
      args.push(...real);
    }
    if (wantsUnassigned) {
      subConds.push("(p.topic IS NULL OR p.topic = '')");
    }
    if (subConds.length > 0) conds.push(`(${subConds.join(' OR ')})`);
  }
  if (opts.cleanOnly) {
    conds.push(CLEAN_POST_COND);
  }
  if (opts.rewritten === 'yes') {
    // 3 = VARIANT_COUNT (services/postCaptionVariants.ts) - hardcode o day de tranh vong lap
    // import nguoc tu db/ sang services/.
    conds.push(
      '(SELECT COUNT(*) FROM post_caption_variants v WHERE v.post_id = p.post_id) >= 3',
    );
  } else if (opts.rewritten === 'no') {
    conds.push('(SELECT COUNT(*) FROM post_caption_variants v WHERE v.post_id = p.post_id) < 3');
  }
  // scraped_at luu dang ISO UTC ("...Z") - quy doi ve gio VN (+7) truoc khi lay ngay, tranh
  // lech 1 ngay voi bai thu thap buoi toi (tuong tu bug da gap voi toISOString() o cho khac).
  if (opts.scrapedFrom) {
    conds.push("date(p.scraped_at, '+7 hours') >= ?");
    args.push(opts.scrapedFrom);
  }
  if (opts.scrapedTo) {
    conds.push("date(p.scraped_at, '+7 hours') <= ?");
    args.push(opts.scrapedTo);
  }
  return { conds, args };
}

const SELECT_LIST = `
  SELECT p.post_id, p.url, p.username, p.caption, p.likes, p.comments, p.views,
         p.post_date, p.scraped_at, p.scrape_error, p.shopee_comment_count,
         p.assigned_account, p.post_status, p.exported_at, p.posted_at, p.topic,
         (SELECT COUNT(*) FROM media m WHERE m.post_id = p.post_id) AS media_count,
         (SELECT COUNT(*) FROM shopee_entries s WHERE s.post_id = p.post_id) AS shopee_count,
         (SELECT COUNT(DISTINCT comment) FROM shopee_entries s WHERE s.post_id = p.post_id) AS distinct_comment_count,
         (SELECT COUNT(*) FROM shopee_entries s WHERE s.post_id = p.post_id
            AND s.new_link IS NOT NULL AND s.new_link <> '') AS new_count,
         (SELECT COUNT(*) FROM shopee_entries s WHERE s.post_id = p.post_id
            AND s.link_status = 'dead') AS dead_link_count,
         (SELECT COUNT(*) FROM shopee_entries s WHERE s.post_id = p.post_id
            AND s.link_status = 'out_of_stock') AS oos_link_count,
         (SELECT COUNT(*) FROM shopee_entries s WHERE s.post_id = p.post_id
            AND s.link_status = 'unknown') AS unknown_link_count,
         (SELECT COUNT(*) FROM shopee_entries s WHERE s.post_id = p.post_id
            AND s.link_status IS NOT NULL) AS checked_link_count,
         (SELECT COUNT(*) FROM post_caption_variants v WHERE v.post_id = p.post_id) AS variant_count,
         (SELECT COUNT(*) FROM aff_clicks c WHERE c.post_id = p.post_id) AS click_count,
         (SELECT COUNT(*) FROM post_runs r WHERE r.post_id = p.post_id) AS posted_count,
         (SELECT comment FROM shopee_entries s WHERE s.post_id = p.post_id
            ORDER BY id LIMIT 1) AS comment,
         (SELECT file FROM media m WHERE m.post_id = p.post_id AND m.type = 'image' AND m.ok = 1
            ORDER BY id LIMIT 1) AS thumb_file,
         (SELECT file FROM media m WHERE m.post_id = p.post_id AND m.ok = 1
            ORDER BY id LIMIT 1) AS any_file
    FROM posts p
`;

export function listPosts(
  opts: PostFilterOpts & { limit?: number; offset?: number; sort?: PostSort } = {},
): {
  total: number;
  items: PostListItem[];
} {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  const { conds, args } = buildPostFilterConds(opts);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM posts p ${where}`).get(...args) as { n: number }
  ).n;

  const rows = db
    .prepare(`${SELECT_LIST} ${where} ORDER BY ${ORDER_BY[opts.sort ?? 'newest'] ?? ORDER_BY.newest} LIMIT ? OFFSET ?`)
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
 * - badLink: bai co link da kiem tra va phat hien link chet/het hang (chua chac da kiem tra het).
 * - unknownLink: bai co link kiem tra khong ra ket luan (bi Shopee chan) - can xem lai thu cong.
 */
export function getExportWarnings(
  opts: PostFilterOpts = {},
): { notUpdated: number; multiComment: number; badLink: number; unknownLink: number } {
  const { conds: baseConds, args } = buildPostFilterConds(opts);
  const withExtra = (extraCond: string) =>
    `SELECT COUNT(*) AS n FROM posts p WHERE ${[...baseConds, extraCond].join(' AND ')}`;
  const n = (sql: string) => (db.prepare(sql).get(...args) as { n: number }).n;
  return {
    notUpdated: n(
      withExtra(
        "EXISTS (SELECT 1 FROM shopee_entries s WHERE s.post_id = p.post_id AND (s.new_link IS NULL OR s.new_link = ''))",
      ),
    ),
    multiComment: n(withExtra('p.shopee_comment_count > 1')),
    badLink: n(
      withExtra(
        "EXISTS (SELECT 1 FROM shopee_entries s WHERE s.post_id = p.post_id AND s.link_status IN ('dead', 'out_of_stock'))",
      ),
    ),
    unknownLink: n(
      withExtra(
        "EXISTS (SELECT 1 FROM shopee_entries s WHERE s.post_id = p.post_id AND s.link_status = 'unknown')",
      ),
    ),
  };
}

export interface ShopeeCheckTarget {
  id: number;
  post_id: string;
  target: string; // new_link neu co, khong thi fallback link goc - dung link nao thi kiem tra link do
}

/**
 * Danh sach link Shopee can kiem tra.
 * LUON kiem tra link GOC (cot link), khong kiem tra new_link: link moi chi la ban affiliate cua
 * cung mot san pham nen trang thai con hang/het hang y het nhau - kiem tra link goc la du, va
 * chay duoc ca voi dong chua kip co link moi.
 * - entryIds: neu truyen vao, chi lay trong danh sach id nay (kiem tra theo lua chon).
 * - postIds: neu truyen vao, chi lay link cua cac bai nay - dung cho nut kiem tra o trang Bai viet.
 */
export function getShopeeCheckTargets(
  opts: { entryIds?: number[]; postIds?: string[] } = {},
): ShopeeCheckTarget[] {
  const targetExpr = 'link';
  const conds = [`${targetExpr} IS NOT NULL`, `${targetExpr} <> ''`];
  const args: unknown[] = [];
  if (opts.entryIds && opts.entryIds.length > 0) {
    conds.push(`id IN (${opts.entryIds.map(() => '?').join(',')})`);
    args.push(...opts.entryIds);
  }
  if (opts.postIds && opts.postIds.length > 0) {
    conds.push(`post_id IN (${opts.postIds.map(() => '?').join(',')})`);
    args.push(...opts.postIds);
  }
  return db
    .prepare(
      `SELECT id, post_id, ${targetExpr} AS target FROM shopee_entries WHERE ${conds.join(' AND ')}`,
    )
    .all(...args) as ShopeeCheckTarget[];
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
