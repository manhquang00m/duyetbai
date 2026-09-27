import { db } from './index';

// Truy van bao cao "Hieu qua Affiliate". Khoang ngay loc theo THOI GIAN CLICK cho ca click lan
// don (nhat quan "click nao ra don nao"). Tien tra ve milli-dong (so nguyen), client tu doi.

export const ORDER_COMPLETED = 'Hoàn thành';
export const ORDER_CANCELLED = 'Đã hủy';

export interface AffFilter {
  from: string; // 'YYYY-MM-DD'
  to: string; // 'YYYY-MM-DD', bao gom ca ngay nay
  topics?: string[];
}

interface Where {
  sql: string;
  args: string[];
}

/** Dieu kien khoang thoi gian click + chu de bai (alias bang = t, bai = posts theo post_id). */
function rangeWhere(f: AffFilter, alias: string): Where {
  const conds = [`${alias}.clicked_at >= ?`, `${alias}.clicked_at <= ?`];
  const args = [`${f.from} 00:00:00`, `${f.to} 23:59:59`];
  if (f.topics && f.topics.length > 0) {
    conds.push(
      `${alias}.post_id IN (SELECT post_id FROM posts WHERE topic IN (${f.topics.map(() => '?').join(',')}))`,
    );
    args.push(...f.topics);
  }
  return { sql: conds.join(' AND '), args };
}

export interface AffSummary {
  clicks: number;
  convertedClicks: number;
  orders: number;
  cancelledOrders: number;
  pendingMilli: number;
  completedMilli: number;
  unmatchedClicks: number;
  byReferrer: { referrer: string; clicks: number }[];
  daily: { date: string; clicks: number; orders: number }[];
}

export function affSummary(f: AffFilter): AffSummary {
  const wc = rangeWhere(f, 'c');
  const wo = rangeWhere(f, 'o');
  const clicks = (
    db.prepare(`SELECT COUNT(*) AS n FROM aff_clicks c WHERE ${wc.sql}`).get(...wc.args) as { n: number }
  ).n;
  const unmatchedClicks = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM aff_clicks c WHERE ${wc.sql} AND c.post_id IS NULL`)
      .get(...wc.args) as { n: number }
  ).n;
  const o = db
    .prepare(
      `SELECT COUNT(DISTINCT CASE WHEN o.order_status <> ? THEN o.order_id END) AS orders,
              COUNT(DISTINCT CASE WHEN o.order_status = ? THEN o.order_id END) AS cancelled,
              COUNT(DISTINCT CASE WHEN o.order_status <> ? THEN o.click_id END) AS converted,
              COALESCE(SUM(CASE WHEN o.order_status = ? THEN o.net_commission_milli END), 0) AS completed,
              COALESCE(SUM(CASE WHEN o.order_status NOT IN (?, ?) THEN o.net_commission_milli END), 0) AS pending
         FROM aff_order_items o WHERE ${wo.sql}`,
    )
    .get(
      ORDER_CANCELLED,
      ORDER_CANCELLED,
      ORDER_CANCELLED,
      ORDER_COMPLETED,
      ORDER_COMPLETED,
      ORDER_CANCELLED,
      ...wo.args,
    ) as { orders: number; cancelled: number; converted: number; completed: number; pending: number };

  const byReferrer = db
    .prepare(
      `SELECT COALESCE(c.referrer, 'Không rõ') AS referrer, COUNT(*) AS clicks
         FROM aff_clicks c WHERE ${wc.sql} GROUP BY 1 ORDER BY clicks DESC`,
    )
    .all(...wc.args) as { referrer: string; clicks: number }[];

  const dailyClicks = db
    .prepare(
      `SELECT substr(c.clicked_at, 1, 10) AS date, COUNT(*) AS n
         FROM aff_clicks c WHERE ${wc.sql} GROUP BY 1`,
    )
    .all(...wc.args) as { date: string; n: number }[];
  const dailyOrders = db
    .prepare(
      `SELECT substr(o.clicked_at, 1, 10) AS date, COUNT(DISTINCT o.order_id) AS n
         FROM aff_order_items o WHERE ${wo.sql} AND o.order_status <> ? GROUP BY 1`,
    )
    .all(...wo.args, ORDER_CANCELLED) as { date: string; n: number }[];

  // Du tat ca cac ngay trong khoang (ke ca ngay 0 click) de bieu do khong bi hut cot.
  const clickMap = new Map(dailyClicks.map((d) => [d.date, d.n]));
  const orderMap = new Map(dailyOrders.map((d) => [d.date, d.n]));
  const daily: AffSummary['daily'] = [];
  for (
    let d = new Date(`${f.from}T00:00:00Z`);
    d <= new Date(`${f.to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const key = d.toISOString().slice(0, 10);
    daily.push({ date: key, clicks: clickMap.get(key) ?? 0, orders: orderMap.get(key) ?? 0 });
  }

  return {
    clicks,
    convertedClicks: o.converted,
    orders: o.orders,
    cancelledOrders: o.cancelled,
    pendingMilli: o.pending,
    completedMilli: o.completed,
    unmatchedClicks,
    byReferrer,
    daily,
  };
}

export interface AffPostRow {
  post_id: string;
  username: string | null;
  caption: string | null;
  topic: string | null;
  url: string | null;
  thumb: string | null;
  clicks: number;
  converted_clicks: number;
  orders: number;
  cancelled_orders: number;
  pending_milli: number;
  completed_milli: number;
  first_click: string | null;
  last_click: string | null;
  referrers: Record<string, number>;
  accounts: string[];
}

export interface AffUnmatchedRow {
  sub_id1: string;
  clicks: number;
  orders: number;
  commission_milli: number;
}

export function affPostStats(f: AffFilter): { posts: AffPostRow[]; unmatched: AffUnmatchedRow[] } {
  const wc = rangeWhere(f, 'c');
  const wo = rangeWhere(f, 'o');
  const clickRows = db
    .prepare(
      `SELECT c.post_id, COUNT(*) AS clicks, MIN(c.clicked_at) AS first_click, MAX(c.clicked_at) AS last_click
         FROM aff_clicks c WHERE ${wc.sql} AND c.post_id IS NOT NULL GROUP BY c.post_id`,
    )
    .all(...wc.args) as { post_id: string; clicks: number; first_click: string; last_click: string }[];
  const refRows = db
    .prepare(
      `SELECT c.post_id, COALESCE(c.referrer, 'Không rõ') AS referrer, COUNT(*) AS n
         FROM aff_clicks c WHERE ${wc.sql} AND c.post_id IS NOT NULL GROUP BY 1, 2`,
    )
    .all(...wc.args) as { post_id: string; referrer: string; n: number }[];
  const orderRows = db
    .prepare(
      `SELECT o.post_id,
              COUNT(DISTINCT CASE WHEN o.order_status <> ? THEN o.order_id END) AS orders,
              COUNT(DISTINCT CASE WHEN o.order_status = ? THEN o.order_id END) AS cancelled,
              COUNT(DISTINCT CASE WHEN o.order_status <> ? THEN o.click_id END) AS converted,
              COALESCE(SUM(CASE WHEN o.order_status = ? THEN o.net_commission_milli END), 0) AS completed,
              COALESCE(SUM(CASE WHEN o.order_status NOT IN (?, ?) THEN o.net_commission_milli END), 0) AS pending
         FROM aff_order_items o WHERE ${wo.sql} AND o.post_id IS NOT NULL GROUP BY o.post_id`,
    )
    .all(
      ORDER_CANCELLED,
      ORDER_CANCELLED,
      ORDER_CANCELLED,
      ORDER_COMPLETED,
      ORDER_COMPLETED,
      ORDER_CANCELLED,
      ...wo.args,
    ) as {
    post_id: string;
    orders: number;
    cancelled: number;
    converted: number;
    completed: number;
    pending: number;
  }[];

  const ids = [...new Set([...clickRows.map((r) => r.post_id), ...orderRows.map((r) => r.post_id)])];
  const clickOf = new Map(clickRows.map((r) => [r.post_id, r]));
  const orderOf = new Map(orderRows.map((r) => [r.post_id, r]));
  const refOf = new Map<string, Record<string, number>>();
  for (const r of refRows) {
    if (!refOf.has(r.post_id)) refOf.set(r.post_id, {});
    refOf.get(r.post_id)![r.referrer] = r.n;
  }

  const postInfo = db.prepare(
    `SELECT p.post_id, p.username, p.caption, p.topic, p.url, p.assigned_account,
            (SELECT file FROM media m WHERE m.post_id = p.post_id AND m.type = 'image' AND m.ok = 1
               ORDER BY id LIMIT 1) AS thumb_file,
            (SELECT file FROM media m WHERE m.post_id = p.post_id AND m.ok = 1 ORDER BY id LIMIT 1) AS any_file,
            (SELECT GROUP_CONCAT(DISTINCT d.account_name) FROM distribution_items d
              WHERE d.post_id = p.post_id) AS dist_accounts
       FROM posts p WHERE p.post_id = ?`,
  );

  const posts: AffPostRow[] = ids.map((id) => {
    const info = postInfo.get(id) as
      | {
          username: string | null;
          caption: string | null;
          topic: string | null;
          url: string | null;
          assigned_account: string | null;
          thumb_file: string | null;
          any_file: string | null;
          dist_accounts: string | null;
        }
      | undefined;
    const c = clickOf.get(id);
    const o = orderOf.get(id);
    const file = info?.thumb_file ?? info?.any_file ?? null;
    const accounts = new Set<string>(
      (info?.dist_accounts ?? '').split(',').filter(Boolean),
    );
    if (info?.assigned_account) accounts.add(info.assigned_account);
    return {
      post_id: id,
      username: info?.username ?? null,
      caption: info?.caption ?? null,
      topic: info?.topic ?? null,
      url: info?.url ?? null,
      thumb: file ? `post_${id}/${file}` : null,
      clicks: c?.clicks ?? 0,
      converted_clicks: o?.converted ?? 0,
      orders: o?.orders ?? 0,
      cancelled_orders: o?.cancelled ?? 0,
      pending_milli: o?.pending ?? 0,
      completed_milli: o?.completed ?? 0,
      first_click: c?.first_click ?? null,
      last_click: c?.last_click ?? null,
      referrers: refOf.get(id) ?? {},
      accounts: [...accounts],
    };
  });

  // Sub_id khong khop bai nao (bai da xoa / chua cao ve) - chi co nghia khi KHONG loc chu de.
  let unmatched: AffUnmatchedRow[] = [];
  if (!f.topics || f.topics.length === 0) {
    const range = [`${f.from} 00:00:00`, `${f.to} 23:59:59`];
    const uc = db
      .prepare(
        `SELECT sub_id1, COUNT(*) AS n FROM aff_clicks
          WHERE post_id IS NULL AND sub_id1 IS NOT NULL AND clicked_at >= ? AND clicked_at <= ?
          GROUP BY sub_id1`,
      )
      .all(...range) as { sub_id1: string; n: number }[];
    const uo = db
      .prepare(
        `SELECT sub_id1,
                COUNT(DISTINCT CASE WHEN order_status <> ? THEN order_id END) AS orders,
                COALESCE(SUM(CASE WHEN order_status <> ? THEN net_commission_milli END), 0) AS commission
           FROM aff_order_items
          WHERE post_id IS NULL AND sub_id1 IS NOT NULL AND clicked_at >= ? AND clicked_at <= ?
          GROUP BY sub_id1`,
      )
      .all(ORDER_CANCELLED, ORDER_CANCELLED, ...range) as {
      sub_id1: string;
      orders: number;
      commission: number;
    }[];
    const m = new Map<string, AffUnmatchedRow>();
    for (const r of uc) m.set(r.sub_id1, { sub_id1: r.sub_id1, clicks: r.n, orders: 0, commission_milli: 0 });
    for (const r of uo) {
      const e = m.get(r.sub_id1) ?? { sub_id1: r.sub_id1, clicks: 0, orders: 0, commission_milli: 0 };
      e.orders = r.orders;
      e.commission_milli = r.commission;
      m.set(r.sub_id1, e);
    }
    unmatched = [...m.values()].sort((a, b) => b.clicks - a.clicks);
  }

  return { posts, unmatched };
}

export interface AffOrderLine {
  order_id: string;
  item_name: string | null;
  shop_name: string | null;
  quantity: number;
  order_status: string | null;
  product_status: string | null;
  ordered_at: string | null;
  completed_at: string | null;
  clicked_at: string | null;
  click_id: string | null;
  order_value_milli: number;
  net_commission_milli: number;
}

export function affPostDetail(
  postId: string,
  f: AffFilter,
): { orders: AffOrderLine[]; daily: { date: string; clicks: number }[] } {
  const range = [`${f.from} 00:00:00`, `${f.to} 23:59:59`];
  const orders = db
    .prepare(
      `SELECT order_id, item_name, shop_name, quantity, order_status, product_status, ordered_at,
              completed_at, clicked_at, click_id, order_value_milli, net_commission_milli
         FROM aff_order_items
        WHERE post_id = ? AND clicked_at >= ? AND clicked_at <= ?
        ORDER BY ordered_at DESC, order_id`,
    )
    .all(postId, ...range) as unknown as AffOrderLine[];
  const daily = db
    .prepare(
      `SELECT substr(clicked_at, 1, 10) AS date, COUNT(*) AS clicks
         FROM aff_clicks WHERE post_id = ? AND clicked_at >= ? AND clicked_at <= ?
        GROUP BY 1 ORDER BY 1`,
    )
    .all(postId, ...range) as { date: string; clicks: number }[];
  return { orders, daily };
}

export interface AffCoverage {
  imports: {
    id: number;
    kind: string;
    file_name: string;
    rows: number;
    inserted: number;
    updated: number;
    skipped: number;
    min_time: string | null;
    max_time: string | null;
    imported_at: string;
  }[];
  clickMin: string | null;
  clickMax: string | null;
  orderClickMin: string | null;
  orderClickMax: string | null;
}

/** Lich su import + khoang du lieu dang co - de UI canh bao 2 file lech khoang ngay. */
export function affCoverage(): AffCoverage {
  const imports = db
    .prepare('SELECT * FROM aff_imports ORDER BY id DESC LIMIT 20')
    .all() as unknown as AffCoverage['imports'];
  const c = db
    .prepare('SELECT MIN(clicked_at) AS mn, MAX(clicked_at) AS mx FROM aff_clicks')
    .get() as { mn: string | null; mx: string | null };
  const o = db
    .prepare('SELECT MIN(clicked_at) AS mn, MAX(clicked_at) AS mx FROM aff_order_items')
    .get() as { mn: string | null; mx: string | null };
  return {
    imports,
    clickMin: c.mn,
    clickMax: c.mx,
    orderClickMin: o.mn,
    orderClickMax: o.mx,
  };
}
