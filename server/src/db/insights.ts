import { db } from './index';
import { loadRuns, attribute, type Run } from './clickAttribution';
import { ORDER_CANCELLED } from './affiliate';

// Phan tich hieu qua dang bai: don vi phan tich la 1 LUOT DANG (post_runs). Click/don duoc gan ve
// luot dang theo clickAttribution. Luot dang trong 24h cuoi cua du lieu click bi bo qua vi chua kip
// nhan click (p90 do tre click ~14h) - neu khong se keo tut moi chi so cua ngay gan nhat.

const MIN_RUNS = 30; // nhom it hon so luot nay khong dua ra nhan dinh
const RECENT_DAYS = 7;

export interface GroupStat {
  key: string;
  label: string;
  runs: number;
  clicks: number;
  hits: number; // so luot co >= 1 click
  orders: number;
  commission_milli: number;
}

export interface Dimension {
  id: string;
  title: string;
  note?: string;
  ordered: boolean; // true = giu thu tu tu nhien (gio, lan dang...), false = sap theo hieu qua
  rows: GroupStat[];
}

export interface Insight {
  tone: 'good' | 'bad' | 'info';
  title: string;
  detail: string;
}

export interface InsightPost {
  post_id: string;
  username: string | null;
  caption: string | null;
  topic: string | null;
  url: string | null;
  thumb: string | null;
  likes: string | null;
  runs: number;
  total_runs: number;
  clicks: number;
  hits: number;
  orders: number;
  commission_milli: number;
  last_run: string | null;
}

interface Counts {
  runs: number;
  clicks: number;
  hits: number;
}

export interface InsightAccount {
  account: string;
  status: string | null;
  runs: number;
  clicks: number;
  hits: number;
  orders: number;
  commission_milli: number;
  recent: Counts;
  previous: Counts;
  last_click: string | null;
}

export interface InsightsReport {
  from: string;
  to: string;
  dataUntil: string | null;
  cutoff: string | null;
  overview: {
    runs: number;
    clicks: number;
    hits: number;
    orders: number;
    commission_milli: number;
    posts: number;
    accounts: number;
    unattributedClicks: number;
  };
  trend: { date: string; runs: number; clicks: number; hits: number }[];
  dimensions: Dimension[];
  topPosts: InsightPost[];
  repostCandidates: InsightPost[];
  deadPosts: { count: number; runs: number; posts: InsightPost[] };
  accounts: InsightAccount[];
  lag: { label: string; clicks: number }[];
  lagMedianHours: number | null;
  products: { item_name: string; shop_name: string | null; orders: number; commission_milli: number }[];
  insights: Insight[];
}

interface RunStat extends Run {
  date: string;
  clicks: number;
  orders: number;
  commission_milli: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const parseLocal = (s: string) => new Date(s.replace(' ', 'T'));
const fmtLocal = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** '3.2K' / '1,2K' / '261' -> so; null neu khong doc duoc. */
function likesNum(s: string | null): number | null {
  if (!s) return null;
  const m = s.replace(',', '.').match(/([\d.]+)\s*([KkMm]?)/);
  if (!m) return null;
  const unit = m[2].toLowerCase();
  return parseFloat(m[1]) * (unit === 'k' ? 1e3 : unit === 'm' ? 1e6 : 1);
}

const rate = (g: Counts) => (g.runs > 0 ? g.clicks / g.runs : 0);
const fmtRate = (g: Counts) => rate(g).toFixed(2).replace('.', ',');
const pctStr = (x: number) => `${Math.round(x * 100)}%`;
const times = (x: number) => `${x.toFixed(1).replace('.', ',')} lần`;

function group(runs: RunStat[], keyOf: (r: RunStat) => { key: string; label: string }): GroupStat[] {
  const m = new Map<string, GroupStat>();
  for (const r of runs) {
    const { key, label } = keyOf(r);
    const g = m.get(key) ?? { key, label, runs: 0, clicks: 0, hits: 0, orders: 0, commission_milli: 0 };
    g.runs++;
    g.clicks += r.clicks;
    if (r.clicks > 0) g.hits++;
    g.orders += r.orders;
    g.commission_milli += r.commission_milli;
    m.set(key, g);
  }
  return [...m.values()];
}

const LIKE_BUCKETS: [number, string][] = [
  [100, '< 100 tim'],
  [500, '100–499 tim'],
  [2000, '500–1.999 tim'],
  [10000, '2K–9.999 tim'],
  [Infinity, '10K+ tim'],
];
const LEN_BUCKETS: [number, string][] = [
  [80, '< 80 ký tự'],
  [200, '80–199 ký tự'],
  [400, '200–399 ký tự'],
  [Infinity, '400+ ký tự'],
];
const bucketOf = (n: number, buckets: [number, string][]) => {
  const i = buckets.findIndex(([max]) => n < max);
  return { key: String(i).padStart(2, '0'), label: buckets[i][1] };
};

export function buildInsights(from: string, to: string): InsightsReport {
  const runsOf = loadRuns();
  const stats = new Map<number, RunStat>();
  for (const list of runsOf.values()) {
    for (const r of list) stats.set(r.id, { ...r, date: r.t.slice(0, 10), clicks: 0, orders: 0, commission_milli: 0 });
  }

  const dataUntil =
    (db.prepare('SELECT MAX(clicked_at) AS mx FROM aff_clicks').get() as { mx: string | null }).mx ?? null;
  const cutoff = dataUntil ? fmtLocal(new Date(parseLocal(dataUntil).getTime() - 86_400_000)) : null;
  const inRange = (r: RunStat) => r.date >= from && r.date <= to && (!cutoff || r.t <= cutoff);

  // Gan click + don cho tung luot dang (toan bo lich su, roi moi loc theo khoang).
  const lagHours: number[] = [];
  let unattributedClicks = 0;
  const clicks = db
    .prepare('SELECT post_id, clicked_at FROM aff_clicks')
    .all() as { post_id: string | null; clicked_at: string }[];
  const lastClickOf = new Map<string, string>();
  for (const c of clicks) {
    const run = c.post_id ? attribute(runsOf, c.post_id, c.clicked_at).run : null;
    const s = run ? stats.get(run.id) : undefined;
    if (!s) {
      const d = c.clicked_at.slice(0, 10);
      if (d >= from && d <= to) unattributedClicks++;
      continue;
    }
    s.clicks++;
    if ((lastClickOf.get(s.account) ?? '') < c.clicked_at) lastClickOf.set(s.account, c.clicked_at);
    if (inRange(s)) lagHours.push((parseLocal(c.clicked_at).getTime() - parseLocal(s.t).getTime()) / 3_600_000);
  }
  const orderRows = db
    .prepare(
      `SELECT post_id, MIN(clicked_at) AS clicked_at, item_name, shop_name,
              COALESCE(SUM(net_commission_milli), 0) AS m
         FROM aff_order_items WHERE post_id IS NOT NULL AND order_status <> ?
        GROUP BY order_id, post_id`,
    )
    .all(ORDER_CANCELLED) as {
    post_id: string;
    clicked_at: string;
    item_name: string | null;
    shop_name: string | null;
    m: number;
  }[];
  const products = new Map<string, InsightsReport['products'][number]>();
  for (const o of orderRows) {
    const run = attribute(runsOf, o.post_id, o.clicked_at).run;
    const s = run ? stats.get(run.id) : undefined;
    if (!s) continue;
    s.orders++;
    s.commission_milli += o.m;
    if (!inRange(s)) continue;
    const name = o.item_name ?? '(không rõ sản phẩm)';
    const p = products.get(name) ?? { item_name: name, shop_name: o.shop_name, orders: 0, commission_milli: 0 };
    p.orders++;
    p.commission_milli += o.m;
    products.set(name, p);
  }

  const R = [...stats.values()].filter(inRange);

  // Thong tin bai cho cac chieu phan tich.
  const postInfo = new Map(
    (
      db.prepare('SELECT post_id, username, caption, topic, likes, url FROM posts').all() as {
        post_id: string;
        username: string | null;
        caption: string | null;
        topic: string | null;
        likes: string | null;
        url: string | null;
      }[]
    ).map((p) => [p.post_id, p]),
  );
  const mediaOf = new Map(
    (
      db
        .prepare(
          `SELECT post_id, SUM(type = 'video' AND ok = 1) AS v, SUM(type = 'image' AND ok = 1) AS i
             FROM media GROUP BY post_id`,
        )
        .all() as { post_id: string; v: number; i: number }[]
    ).map((m) => [m.post_id, m]),
  );
  const variantLen = new Map(
    (
      db.prepare('SELECT post_id, variant_index, length(caption) AS len FROM post_caption_variants').all() as {
        post_id: string;
        variant_index: number;
        len: number;
      }[]
    ).map((v) => [`${v.post_id}#${v.variant_index}`, v.len]),
  );

  const dimensions: Dimension[] = [
    {
      id: 'topic',
      title: 'Chủ đề',
      ordered: false,
      rows: group(R, (r) => {
        const t = postInfo.get(r.post_id)?.topic || '(chưa gán)';
        return { key: t, label: t };
      }),
    },
    {
      id: 'nth',
      title: 'Lần đăng thứ mấy của bài',
      note: 'Cùng 1 bài đăng lại nhiều lần trên các nick',
      ordered: true,
      rows: group(R, (r) => (r.nth >= 6 ? { key: '06', label: 'Lần 6+' } : { key: pad(r.nth), label: `Lần ${r.nth}` })),
    },
    {
      id: 'hour',
      title: 'Giờ đăng',
      ordered: true,
      rows: group(R, (r) => {
        const h = Number(r.t.slice(11, 13));
        return { key: pad(h), label: `${h}h` };
      }),
    },
    {
      id: 'likes',
      title: 'Số tim của bài gốc',
      note: 'Bài gốc được cào về',
      ordered: true,
      rows: group(R, (r) => {
        const n = likesNum(postInfo.get(r.post_id)?.likes ?? null);
        return n == null ? { key: '99', label: 'Chưa có số tim' } : bucketOf(n, LIKE_BUCKETS);
      }),
    },
    {
      id: 'length',
      title: 'Độ dài caption đã đăng',
      ordered: true,
      rows: group(R, (r) => {
        const len =
          (r.variant ? variantLen.get(`${r.post_id}#${r.variant}`) : undefined) ??
          postInfo.get(r.post_id)?.caption?.length;
        return len == null ? { key: '99', label: 'Không rõ' } : bucketOf(len, LEN_BUCKETS);
      }),
    },
    {
      id: 'media',
      title: 'Loại media',
      ordered: false,
      rows: group(R, (r) => {
        const m = mediaOf.get(r.post_id);
        const label = m?.v && m?.i ? 'Video + ảnh' : m?.v ? 'Chỉ video' : m?.i ? 'Chỉ ảnh' : 'Không có media';
        return { key: label, label };
      }),
    },
    {
      id: 'variant',
      title: 'Bản caption',
      note: 'Chênh lệch giữa các bản không ổn định khi so cùng lần đăng — chưa đủ cơ sở kết luận',
      ordered: true,
      rows: group(R, (r) =>
        r.variant ? { key: `v${r.variant}`, label: `AI bản ${r.variant}` } : { key: 'v0', label: 'Caption gốc' },
      ),
    },
  ];
  for (const d of dimensions) {
    d.rows.sort(d.ordered ? (a, b) => a.key.localeCompare(b.key) : (a, b) => rate(b) - rate(a));
  }

  // Theo ngay dang.
  const trendMap = new Map<string, { date: string; runs: number; clicks: number; hits: number }>();
  for (const r of R) {
    const e = trendMap.get(r.date) ?? { date: r.date, runs: 0, clicks: 0, hits: 0 };
    e.runs++;
    e.clicks += r.clicks;
    if (r.clicks > 0) e.hits++;
    trendMap.set(r.date, e);
  }
  const trend = [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  // Chia "7 ngay gan nhat" va "7 ngay truoc do" tinh tu ngay cuoi con du lieu.
  const lastDate = trend.length > 0 ? trend[trend.length - 1].date : to;
  const recentFrom = addDays(lastDate, -(RECENT_DAYS - 1));
  const prevFrom = addDays(recentFrom, -RECENT_DAYS);
  const isRecent = (r: RunStat) => r.date >= recentFrom;
  const isPrev = (r: RunStat) => r.date >= prevFrom && r.date < recentFrom;

  // Theo bai.
  const allTimeOf = new Map<string, { runs: number; clicks: number }>();
  for (const s of stats.values()) {
    const e = allTimeOf.get(s.post_id) ?? { runs: 0, clicks: 0 };
    e.runs++;
    e.clicks += s.clicks;
    allTimeOf.set(s.post_id, e);
  }
  const postAgg = new Map<string, InsightPost>();
  for (const r of R) {
    const info = postInfo.get(r.post_id);
    const p =
      postAgg.get(r.post_id) ??
      ({
        post_id: r.post_id,
        username: info?.username ?? null,
        caption: info?.caption ?? null,
        topic: info?.topic ?? null,
        url: info?.url ?? null,
        thumb: null,
        likes: info?.likes ?? null,
        runs: 0,
        total_runs: allTimeOf.get(r.post_id)?.runs ?? 0,
        clicks: 0,
        hits: 0,
        orders: 0,
        commission_milli: 0,
        last_run: null,
      } satisfies InsightPost);
    p.runs++;
    p.clicks += r.clicks;
    if (r.clicks > 0) p.hits++;
    p.orders += r.orders;
    p.commission_milli += r.commission_milli;
    if (!p.last_run || p.last_run < r.t) p.last_run = r.t;
    postAgg.set(r.post_id, p);
  }
  const posts = [...postAgg.values()];
  const thumbStmt = db.prepare(
    `SELECT file FROM media WHERE post_id = ? AND ok = 1 ORDER BY (type = 'image') DESC, id LIMIT 1`,
  );
  const withThumb = (p: InsightPost): InsightPost => {
    const f = thumbStmt.get(p.post_id) as { file: string } | undefined;
    return { ...p, thumb: f ? `post_${p.post_id}/${f.file}` : null };
  };

  const totalRuns = R.length;
  const totalClicks = R.reduce((s, r) => s + r.clicks, 0);
  const avg = totalRuns > 0 ? totalClicks / totalRuns : 0;

  const topPosts = [...posts].sort((a, b) => b.clicks - a.clicks || b.orders - a.orders).slice(0, 20).map(withThumb);
  const repostCandidates = posts
    .filter((p) => p.total_runs <= 3 && p.hits > 0 && rate(p) >= Math.max(1, 2 * avg))
    .sort((a, b) => rate(b) - rate(a))
    .slice(0, 15)
    .map(withThumb);
  const dead = posts.filter((p) => p.total_runs >= 3 && (allTimeOf.get(p.post_id)?.clicks ?? 0) === 0);
  const deadPosts = {
    count: dead.length,
    runs: dead.reduce((s, p) => s + p.runs, 0),
    posts: [...dead].sort((a, b) => b.total_runs - a.total_runs).map(withThumb),
  };

  // Theo tai khoan.
  const statusOf = new Map(
    (
      db.prepare('SELECT name, active, banned, appeal_status FROM accounts').all() as {
        name: string;
        active: number;
        banned: number;
        appeal_status: string | null;
      }[]
    ).map((a) => [a.name, a.banned ? 'Banned' : !a.active ? 'Tắt' : a.appeal_status]),
  );
  const accMap = new Map<string, InsightAccount>();
  for (const r of R) {
    const a =
      accMap.get(r.account) ??
      ({
        account: r.account,
        status: statusOf.get(r.account) ?? null,
        runs: 0,
        clicks: 0,
        hits: 0,
        orders: 0,
        commission_milli: 0,
        recent: { runs: 0, clicks: 0, hits: 0 },
        previous: { runs: 0, clicks: 0, hits: 0 },
        last_click: lastClickOf.get(r.account) ?? null,
      } satisfies InsightAccount);
    a.runs++;
    a.clicks += r.clicks;
    if (r.clicks > 0) a.hits++;
    a.orders += r.orders;
    a.commission_milli += r.commission_milli;
    const bucket = isRecent(r) ? a.recent : isPrev(r) ? a.previous : null;
    if (bucket) {
      bucket.runs++;
      bucket.clicks += r.clicks;
      if (r.clicks > 0) bucket.hits++;
    }
    accMap.set(r.account, a);
  }
  const accounts = [...accMap.values()].sort((a, b) => b.clicks - a.clicks || rate(b) - rate(a));

  // Do tre click.
  const LAG: [number, string][] = [
    [1, '< 1 giờ'],
    [3, '1–3 giờ'],
    [6, '3–6 giờ'],
    [12, '6–12 giờ'],
    [24, '12–24 giờ'],
    [72, '1–3 ngày'],
    [Infinity, '> 3 ngày'],
  ];
  const lag = LAG.map(([, label]) => ({ label, clicks: 0 }));
  for (const h of lagHours) lag[LAG.findIndex(([max]) => h < max)].clicks++;
  const sortedLag = [...lagHours].sort((a, b) => a - b);
  const lagMedianHours = sortedLag.length > 0 ? sortedLag[Math.floor(sortedLag.length / 2)] : null;

  const overview = {
    runs: totalRuns,
    clicks: totalClicks,
    hits: R.filter((r) => r.clicks > 0).length,
    orders: R.reduce((s, r) => s + r.orders, 0),
    commission_milli: R.reduce((s, r) => s + r.commission_milli, 0),
    posts: posts.length,
    accounts: accounts.length,
    unattributedClicks,
  };

  const recentAll = { runs: 0, clicks: 0, hits: 0 };
  const prevAll = { runs: 0, clicks: 0, hits: 0 };
  for (const r of R) {
    const b = isRecent(r) ? recentAll : isPrev(r) ? prevAll : null;
    if (b) {
      b.runs++;
      b.clicks += r.clicks;
      if (r.clicks > 0) b.hits++;
    }
  }

  return {
    from,
    to,
    dataUntil,
    cutoff,
    overview,
    trend,
    dimensions,
    topPosts,
    repostCandidates,
    deadPosts,
    accounts,
    lag,
    lagMedianHours,
    products: [...products.values()].sort((a, b) => b.commission_milli - a.commission_milli).slice(0, 10),
    insights: totalRuns === 0 ? [] : buildRules({ avg, dimensions, posts, accounts, recentAll, prevAll, overview, lagMedianHours }),
  };
}

function buildRules(x: {
  avg: number;
  dimensions: Dimension[];
  posts: InsightPost[];
  accounts: InsightAccount[];
  recentAll: Counts;
  prevAll: Counts;
  overview: InsightsReport['overview'];
  lagMedianHours: number | null;
}): Insight[] {
  const out: Insight[] = [];
  const { avg, overview } = x;
  const dim = (id: string) => x.dimensions.find((d) => d.id === id)!.rows;
  const big = (rows: GroupStat[]) => rows.filter((g) => g.runs >= MIN_RUNS);
  const lift = (g: Counts) => (avg > 0 ? rate(g) / avg : 0);
  // Ti le luot co click it bi 1 bai viral keo lech hon click/luot -> moi nhan dinh tot/xau phai duoc
  // ca 2 chi so cung chieu xac nhan.
  const hitRate = (g: Counts) => (g.runs > 0 ? g.hits / g.runs : 0);
  const avgHit = overview.runs > 0 ? overview.hits / overview.runs : 0;
  const hitLift = (g: Counts) => (avgHit > 0 ? hitRate(g) / avgHit : 0);
  const isGood = (g: Counts, th: number) => lift(g) >= th && hitLift(g) >= 1.1;
  const isBad = (g: Counts, th: number) => lift(g) <= th && hitLift(g) <= 0.9;

  // 1. Xu huong.
  if (x.prevAll.runs >= 50 && x.recentAll.runs >= 50 && rate(x.prevAll) > 0 && hitRate(x.prevAll) > 0) {
    const change = rate(x.recentAll) / rate(x.prevAll) - 1;
    const hitChange = hitRate(x.recentAll) / hitRate(x.prevAll) - 1;
    const detail = `7 ngày gần nhất: ${fmtRate(x.recentAll)} click/lượt, ${pctStr(hitRate(x.recentAll))} lượt có click (${x.recentAll.runs} lượt) · 7 ngày trước đó: ${fmtRate(x.prevAll)} click/lượt, ${pctStr(hitRate(x.prevAll))} lượt có click (${x.prevAll.runs} lượt).`;
    if (change <= -0.2 && hitChange <= -0.1) {
      out.push({ tone: 'bad', title: `Click mỗi lượt đăng giảm ${pctStr(-change)} so với tuần trước`, detail });
    } else if (change <= -0.2) {
      out.push({
        tone: 'info',
        title: `Click mỗi lượt giảm ${pctStr(-change)}, nhưng tỉ lệ lượt có click gần như giữ nguyên`,
        detail: `${detail} Phần giảm chủ yếu do tuần trước có vài bài/nick nổ đột biến.`,
      });
    } else if (change >= 0.2 && hitChange >= 0.1) {
      out.push({ tone: 'good', title: `Click mỗi lượt đăng tăng ${pctStr(change)} so với tuần trước`, detail });
    } else {
      out.push({ tone: 'info', title: 'Hiệu quả mỗi lượt đăng đi ngang so với tuần trước', detail });
    }
  }

  // 2. Dang lai nhieu lan -> nhat dan (theo ti le luot co click).
  const nth = dim('nth');
  const first = nth.find((g) => g.key === '01');
  if (first && first.runs >= MIN_RUNS && hitRate(first) > 0) {
    const drop = nth.find((g) => g.key !== '01' && g.runs >= MIN_RUNS && hitRate(g) < hitRate(first) * 0.6);
    if (drop) {
      const k = Number(drop.key);
      const tired = nth.filter((g) => Number(g.key) >= k).reduce((s, g) => s + g.runs, 0);
      out.push({
        tone: 'bad',
        title: `Từ lần đăng thứ ${k}, bài gần như hết sức kéo click`,
        detail: `Lượt có click: lần đầu ${pctStr(hitRate(first))} → ${drop.label.toLowerCase()} ${pctStr(hitRate(drop))} (click/lượt ${fmtRate(first)} → ${fmtRate(drop)}). Hiện ${pctStr(tired / overview.runs)} lượt đăng là bài đã đăng từ ${k} lần trở lên → mỗi bài tối đa ${k - 1} lần, bổ sung bài mới vào kho.`,
      });
    }
  }

  // 3. Phan bo chu de: chiem nhieu luot nhung it click / hieu qua cao nhung it duoc dang.
  const topics = big(dim('topic'));
  const share = (g: GroupStat) => ({ run: g.runs / overview.runs, click: overview.clicks > 0 ? g.clicks / overview.clicks : 0 });
  const waste = topics
    .filter((g) => share(g).click < share(g).run * 0.5 && share(g).run >= 0.1 && hitLift(g) <= 0.9)
    .sort((a, b) => share(b).run - share(b).click - (share(a).run - share(a).click))[0];
  if (waste) {
    out.push({
      tone: 'bad',
      title: `Chủ đề "${waste.label}" chiếm ${pctStr(share(waste).run)} lượt đăng nhưng chỉ mang về ${pctStr(share(waste).click)} click`,
      detail: `${fmtRate(waste)} click/lượt so với trung bình ${avg.toFixed(2).replace('.', ',')} → giảm tỷ trọng hoặc đổi cách viết cho chủ đề này.`,
    });
  }
  const bestTopic = topics.filter((g) => isGood(g, 1.5)).sort((a, b) => lift(b) - lift(a))[0];
  if (bestTopic) {
    out.push({
      tone: 'good',
      title: `Chủ đề "${bestTopic.label}" hiệu quả gấp ${times(lift(bestTopic))} trung bình`,
      detail: `${fmtRate(bestTopic)} click/lượt, ${pctStr(bestTopic.hits / bestTopic.runs)} lượt có click. Hiện chỉ chiếm ${pctStr(share(bestTopic).run)} lượt đăng → tăng tỷ trọng, tìm thêm bài cùng kiểu.`,
    });
  }

  // 4. Khung gio: gop 3 tieng.
  const hours = dim('hour');
  const windows: GroupStat[] = [];
  for (let h = 0; h < 24; h += 3) {
    const rows = hours.filter((g) => Number(g.key) >= h && Number(g.key) < h + 3);
    windows.push({
      key: String(h),
      label: `${h}h–${h + 3}h`,
      runs: rows.reduce((s, g) => s + g.runs, 0),
      clicks: rows.reduce((s, g) => s + g.clicks, 0),
      hits: rows.reduce((s, g) => s + g.hits, 0),
      orders: 0,
      commission_milli: 0,
    });
  }
  const bestWin = big(windows).filter((g) => isGood(g, 1.3)).sort((a, b) => lift(b) - lift(a))[0];
  if (bestWin) {
    out.push({
      tone: 'good',
      title: `Đăng khung ${bestWin.label} cho nhiều click nhất`,
      detail: `${fmtRate(bestWin)} click/lượt (gấp ${times(lift(bestWin))} trung bình) nhưng mới chiếm ${pctStr(bestWin.runs / overview.runs)} lượt đăng → dồn lịch đăng vào khung này.`,
    });
  }
  const worstWin = big(windows)
    .filter((g) => g.runs / overview.runs >= 0.15 && isBad(g, 0.7))
    .sort((a, b) => lift(a) - lift(b))[0];
  if (worstWin) {
    out.push({
      tone: 'info',
      title: `Khung ${worstWin.label} đăng nhiều nhưng ít click`,
      detail: `${pctStr(worstWin.runs / overview.runs)} lượt đăng, chỉ ${fmtRate(worstWin)} click/lượt → dời bớt sang khung tốt hơn.`,
    });
  }

  // 5-7. Dac diem noi dung.
  const contentRule = (id: string, what: string) => {
    const rows = big(dim(id)).filter((g) => g.key !== '99');
    const best = rows.filter((g) => isGood(g, 1.3)).sort((a, b) => lift(b) - lift(a))[0];
    const worst = rows.filter((g) => isBad(g, 0.5)).sort((a, b) => lift(a) - lift(b))[0];
    if (best) {
      out.push({
        tone: 'good',
        title: `${what} "${best.label}" cho click tốt nhất`,
        detail: `${fmtRate(best)} click/lượt (gấp ${times(lift(best))} trung bình), ${pctStr(best.hits / best.runs)} lượt có click${worst ? ` · kém nhất: "${worst.label}" ${fmtRate(worst)} click/lượt` : ''}.`,
      });
    }
  };
  contentRule('likes', 'Bài gốc');
  contentRule('length', 'Caption');
  contentRule('media', 'Media');

  // 8. Do tap trung.
  const sortedPosts = [...x.posts].sort((a, b) => b.clicks - a.clicks);
  if (overview.clicks > 0 && sortedPosts.length >= 20) {
    const top10 = sortedPosts.slice(0, 10).reduce((s, p) => s + p.clicks, 0);
    const zero = sortedPosts.filter((p) => p.clicks === 0).length;
    out.push({
      tone: 'info',
      title: `10 bài tốt nhất mang về ${pctStr(top10 / overview.clicks)} click, ${pctStr(zero / sortedPosts.length)} bài chưa có click nào`,
      detail: 'Xem danh sách "Bài nên đăng tiếp" để nhân bản mẫu thắng, và "Bài nên dừng" để loại khỏi kho phân phối.',
    });
  }

  // 9. Tai khoan.
  const deadAcc = x.accounts.filter((a) => a.runs >= 10 && a.clicks === 0);
  if (deadAcc.length > 0) {
    out.push({
      tone: 'bad',
      title: `${deadAcc.length} nick đăng từ 10 lượt trở lên nhưng 0 click`,
      detail: `${deadAcc
        .slice(0, 6)
        .map((a) => a.account)
        .join(', ')}${deadAcc.length > 6 ? '…' : ''} → kiểm tra bị bóp reach/shadowban, comment link có hiển thị không, trước khi đăng tiếp.`,
    });
  }
  const falling = x.accounts.filter(
    (a) => a.previous.runs >= 10 && a.recent.runs >= 5 && rate(a.previous) >= 0.3 && rate(a.recent) < rate(a.previous) * 0.5,
  );
  if (falling.length > 0) {
    out.push({
      tone: 'bad',
      title: `${falling.length} nick đang tụt mạnh so với tuần trước`,
      detail: falling
        .slice(0, 6)
        .map((a) => `${a.account} ${fmtRate(a.previous)} → ${fmtRate(a.recent)}`)
        .join(' · '),
    });
  }
  const topAcc = x.accounts.slice(0, 3);
  if (overview.clicks > 0 && x.accounts.length >= 6) {
    const s = topAcc.reduce((n, a) => n + a.clicks, 0) / overview.clicks;
    if (s >= 0.4) {
      out.push({
        tone: 'info',
        title: `3 nick mang về ${pctStr(s)} tổng click`,
        detail: `${topAcc.map((a) => `${a.account} (${fmtRate(a)} click/lượt)`).join(', ')} → xem các nick này đăng gì, giờ nào để áp dụng cho nick khác; tránh phụ thuộc vào vài nick.`,
      });
    }
  }

  // 10. Vong doi bai.
  if (x.lagMedianHours != null) {
    out.push({
      tone: 'info',
      title: `Một nửa số click đến trong ${x.lagMedianHours.toFixed(1).replace('.', ',')} giờ đầu sau khi đăng`,
      detail: 'Bài sống ngắn → đăng đều nhiều lượt trong ngày tốt hơn dồn một lúc.',
    });
  }

  if (overview.clicks + overview.unattributedClicks > 0 && overview.unattributedClicks / (overview.clicks + overview.unattributedClicks) >= 0.15) {
    out.push({
      tone: 'info',
      title: `${overview.unattributedClicks} click chưa gắn được với lượt đăng nào`,
      detail: 'Bài đăng ngoài tool hoặc trước khi có nhật ký đăng — các con số ở đây chưa tính phần này.',
    });
  }

  const order = { bad: 0, good: 1, info: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}
