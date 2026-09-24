import { randomUUID } from 'node:crypto';
import {
  listCleanPostsWithTopic,
  cleanPoolByTopic,
  loadUsageByDate,
  loadPostUsageCount,
  loadVariantUsageCount,
  loadPostsWithVariants,
  contentKey,
  insertPlan,
  type PlanItemRow,
} from '../db/distribution';
import { listDistributionCandidates, type PostingAccount } from '../db/postingTopics';
import { VARIANT_COUNT } from './postCaptionVariants';
import { addDays } from '../utils/dates';
import { makeRng } from '../utils/rng';

export interface PlanOptions {
  days: number;
  perDay: number;
  startDate: string; // 'YYYY-MM-DD'
  accountIds?: number[];
  topics?: string[];
  scrapedFrom?: string; // 'YYYY-MM-DD' - chi lay bai co scraped_at (thu thap) trong khoang nay
  scrapedTo?: string; // 'YYYY-MM-DD', bao gom ca ngay nay
  seed?: string;
  name?: string;
}

export interface AccountCapacity {
  id: number;
  name: string;
  topics: string[];
  poolSize: number; // tong bai sach thuoc cac chu de cua account
  demand: number; // days * perDay
  deficit: number; // max(0, demand - poolSize) - CANH BAO THAM KHAO, khong phai gioi han cung:
  // 1 account duoc phep nhan lai bai cu neu cach du ngay (xem luat gian ngay), nen kho van co the
  // dap ung duoc demand lon hon poolSize neu du ngay de xoay vong.
}

export interface PlanShortage {
  accountName: string;
  date: string;
  dayIndex: number;
  missing: number;
}

export interface PlanPreview {
  accounts: AccountCapacity[];
  poolByTopic: Record<string, number>;
  poolTotal: number;
  totalSlots: number;
  assignableSlots: number;
  shortages: PlanShortage[];
  emptyTopics: string[];
  warnings: string[];
}

/** Loi nghiep vu (khong phai bug) -> API tra 400 kem dung thong diep nay. */
export class DistributionError extends Error {}

interface CoreResult {
  planId: string;
  items: Omit<PlanItemRow, 'id'>[];
  shortages: PlanShortage[];
  capacities: AccountCapacity[];
  accounts: PostingAccount[];
  poolByTopic: Record<string, number>;
  poolTotal: number;
  effectivePoolTotal: number; // ke ca ban caption: bai co N ban tinh la N don vi cho luat gian ngay
  seed: string;
}

/**
 * Loi dung chung cho previewPlan va generatePlan - hai duong nay KHONG BAO GIO duoc lech nhau,
 * nguoi dung xem truoc thay gi thi tao ra dung the (cung seed -> cung ket qua).
 */
function computeAssignments(opts: PlanOptions): CoreResult {
  let accounts = listDistributionCandidates(opts.topics);
  if (opts.accountIds && opts.accountIds.length > 0) {
    const want = new Set(opts.accountIds);
    accounts = accounts.filter((a) => want.has(a.id));
  }
  if (accounts.length === 0) {
    throw new DistributionError(
      'Không có tài khoản nào đủ điều kiện (cần: đang bật, không banned, trạng thái Live/Kháng ' +
        'thành công/Chưa kháng/Đang ngâm, và đã gán chủ đề)',
    );
  }

  const cleanPosts = listCleanPostsWithTopic({
    topics: opts.topics,
    scrapedFrom: opts.scrapedFrom,
    scrapedTo: opts.scrapedTo,
  });
  if (cleanPosts.length === 0) {
    throw new DistributionError(
      opts.scrapedFrom || opts.scrapedTo
        ? 'Không có bài sạch nào trong khoảng ngày thu thập đã chọn để phân phối'
        : 'Không có bài sạch nào để phân phối',
    );
  }

  const postsByTopic = new Map<string, string[]>();
  for (const p of cleanPosts) {
    if (!postsByTopic.has(p.topic)) postsByTopic.set(p.topic, []);
    postsByTopic.get(p.topic)!.push(p.post_id);
  }
  const topicOf = new Map(cleanPosts.map((p) => [p.post_id, p.topic]));

  const usageCount = loadPostUsageCount();
  const variantUsageCount = loadVariantUsageCount();
  const postsWithVariants = loadPostsWithVariants();
  // Cac "ban" (variant) mot bai co the dung: bai chua co ban viet lai chi co 1 lua chon (null =
  // dung caption goc); bai co du ban thi co VARIANT_COUNT lua chon RIENG cho luat gian ngay.
  const variantsOf = (postId: string): (number | null)[] =>
    postsWithVariants.has(postId)
      ? Array.from({ length: VARIANT_COUNT }, (_, i) => i + 1)
      : [null];

  const dates: string[] = [];
  for (let d = 0; d < opts.days; d++) dates.push(addDays(opts.startDate, d));

  // Nap ca hai ngay lien ke o hai dau: luat gian ngay phai dung XUYEN ca cac ke hoach da co,
  // khong chi trong noi bo ke hoach dang lap.
  const window = new Set<string>();
  for (const d of dates) {
    window.add(addDays(d, -1));
    window.add(d);
    window.add(addDays(d, 1));
  }
  const usedByDate = loadUsageByDate([...window]);
  const dayUsed = (date: string): Set<string> => {
    if (!usedByDate.has(date)) usedByDate.set(date, new Set());
    return usedByDate.get(date)!;
  };

  const seed = opts.seed?.trim() || randomUUID();
  const rng = makeRng(seed);
  const planId = randomUUID();

  // Ban sao de mo phong, khong dung vao du lieu that
  const localUsage = new Map(usageCount);
  const localVariantUsage = new Map(variantUsageCount);

  // Hop kho cua tat ca chu de ma account do nhan
  const poolOf = new Map<number, string[]>();
  for (const a of accounts) {
    const s = new Set<string>();
    for (const t of a.topics) for (const id of postsByTopic.get(t) ?? []) s.add(id);
    poolOf.set(a.id, [...s]);
  }

  const items: Omit<PlanItemRow, 'id'>[] = [];
  const shortages: PlanShortage[] = [];

  for (let d = 0; d < opts.days; d++) {
    const date = dates[d];
    // Luat gian ngay: bai dung hom truoc / hom nay / hom sau deu bi cam.
    const blocked = new Set<string>([
      ...dayUsed(addDays(date, -1)),
      ...dayUsed(date),
      ...dayUsed(addDays(date, 1)),
    ]);

    // Bai con "dung duoc" hom nay = con IT NHAT 1 ban (hoac ban goc, neu chua viet lai) CHUA bi
    // dung trong ca so 3 ngay (hom qua/hom nay/hom sau) - xem contentKey() trong db/distribution.ts.
    const hasFreeVariant = (postId: string) =>
      variantsOf(postId).some((v) => !blocked.has(contentKey(postId, v)));
    // 1 account KHONG bi cam nhan lai bai cu (da noi long xuong luat gian ngay o tren), nhung
    // van khong duoc nhan TRUNG 1 bai 2 LAN TRONG CUNG 1 NGAY (vd 2 slot cung ngay lo chon lai) -
    // rieng gioi han nay reset moi ngay, KHONG cong don qua cac ngay.
    const usedTodayByAccount = new Map<string, Set<string>>();
    const remaining = (a: PostingAccount) =>
      poolOf
        .get(a.id)!
        .filter((p) => !usedTodayByAccount.get(a.name)?.has(p) && hasFreeVariant(p));

    for (let slot = 0; slot < opts.perDay; slot++) {
      // slot o VONG NGOAI: moi account nhan bai thu nhat truoc khi ai do nhan bai thu hai.
      // Account IT LUA CHON NHAT di truoc (heuristic Hall) - neu khong, account chu de rong
      // se cuop het bai cua account chu de hep.
      const order = [...accounts].sort((x, y) => {
        const cx = remaining(x).length;
        const cy = remaining(y).length;
        return cx !== cy ? cx - cy : rng.next() - 0.5;
      });

      for (const a of order) {
        const cand = remaining(a);
        if (cand.length === 0) {
          shortages.push({ accountName: a.name, date, dayIndex: d, missing: 1 });
          continue;
        }
        // Boc ngau nhien trong nhom bai IT DUNG NHAT (gop ca 3 ban): van ngau nhien nhung rai
        // deu ca kho thay vi cay di cay lai vai bai.
        let minUse = Infinity;
        for (const p of cand) minUse = Math.min(minUse, localUsage.get(p) ?? 0);
        const pick = rng.pick(cand.filter((p) => (localUsage.get(p) ?? 0) === minUse));

        // Trong cac ban CON TRONG cua "pick" o ngay nay, uu tien ban IT DUNG NHAT (moi nhat) -
        // dung y "uu tien lay caption moi de dung" thay vi cu xoay theo 1 cong thuc co dinh.
        const freeVariants = variantsOf(pick).filter((v) => !blocked.has(contentKey(pick, v)));
        let minVariantUse = Infinity;
        for (const v of freeVariants) {
          minVariantUse = Math.min(minVariantUse, localVariantUsage.get(contentKey(pick, v)) ?? 0);
        }
        const captionVariant = rng.pick(
          freeVariants.filter((v) => (localVariantUsage.get(contentKey(pick, v)) ?? 0) === minVariantUse),
        );

        items.push({
          plan_id: planId,
          day_index: d,
          slot_index: slot,
          post_date: date,
          account_id: a.id,
          account_name: a.name,
          post_id: pick,
          topic: topicOf.get(pick) ?? null,
          caption_variant: captionVariant,
        });
        if (!usedTodayByAccount.has(a.name)) usedTodayByAccount.set(a.name, new Set());
        usedTodayByAccount.get(a.name)!.add(pick);
        const key = contentKey(pick, captionVariant);
        blocked.add(key);
        dayUsed(date).add(key);
        localUsage.set(pick, minUse + 1);
        localVariantUsage.set(key, minVariantUse + 1);
      }
    }
  }

  const demand = opts.days * opts.perDay;
  const capacities: AccountCapacity[] = accounts.map((a) => {
    const pool = poolOf.get(a.id)!;
    return {
      id: a.id,
      name: a.name,
      topics: a.topics,
      poolSize: pool.length,
      demand,
      deficit: Math.max(0, demand - pool.length),
    };
  });

  // Sức chứa THỰC cho luật giãn ngày: bài có 3 bản caption tính là 3 don vi noi dung (xem
  // contentKey), khong phai 1 - viet them caption la mo rong duoc suc chua nay ma khong can them
  // bai moi.
  const effectivePoolTotal = cleanPosts.reduce(
    (sum, p) => sum + variantsOf(p.post_id).length,
    0,
  );

  return {
    planId,
    items,
    shortages,
    capacities,
    accounts,
    poolByTopic: cleanPoolByTopic({ scrapedFrom: opts.scrapedFrom, scrapedTo: opts.scrapedTo }),
    poolTotal: cleanPosts.length,
    effectivePoolTotal,
    seed,
  };
}

function buildWarnings(r: CoreResult, opts: PlanOptions): string[] {
  const w: string[] = [];

  for (const c of r.capacities) {
    if (c.poolSize === 0) {
      w.push(
        `"${c.name}" không có bài nào thuộc chủ đề đang gán (${c.topics.join(', ') || 'chưa gán'})`,
      );
    } else if (c.deficit > 0) {
      w.push(
        `"${c.name}" chỉ có ${c.poolSize} bài phù hợp chủ đề nhưng kế hoạch cần ${c.demand} vị trí — ` +
          `có thể sẽ thiếu ${c.deficit} nếu không đủ ngày giãn cách để xoay vòng lại bài cũ. ` +
          'Gán thêm chủ đề cho tài khoản này để mở rộng kho.',
      );
    }
  }

  const noVariant = r.items.filter((i) => i.caption_variant === null).length;
  if (noVariant > 0) {
    w.push(
      `${noVariant} vị trí dùng caption gốc vì bài chưa có bản viết lại — chạy "Viết lại caption ` +
        'kho bài" trước khi lập kế hoạch để tránh nhiều tài khoản đăng trùng nội dung.',
    );
  }

  // Tran theo ngay: luat gian ngay bat 2 ngay lien ke dung 2 tap NOI DUNG roi nhau (1 bai co N
  // ban caption tinh la N don vi, khong phai 1 - xem effectivePoolTotal).
  const need = 2 * r.accounts.length * opts.perDay;
  if (need > r.effectivePoolTotal) {
    w.push(
      `Luật giãn ngày cần ${r.accounts.length} tài khoản × ${opts.perDay} bài × 2 ngày liền = ${need} ` +
        `đơn vị nội dung khác nhau (bài × số bản caption), nhưng kho chỉ có ${r.effectivePoolTotal} ` +
        '(đã tính cả các bản caption viết lại). Giảm số bài/ngày, chia tài khoản thành nhiều đợt, ' +
        'hoặc viết thêm caption cho các bài còn thiếu bản để tăng sức chứa.',
    );
  }
  return w;
}

export function previewPlan(opts: PlanOptions): PlanPreview {
  const r = computeAssignments(opts);
  return {
    accounts: r.capacities,
    poolByTopic: r.poolByTopic,
    poolTotal: r.poolTotal,
    totalSlots: r.accounts.length * opts.days * opts.perDay,
    assignableSlots: r.items.length,
    shortages: r.shortages,
    emptyTopics: Object.entries(r.poolByTopic)
      .filter(([, n]) => n === 0)
      .map(([t]) => t),
    warnings: buildWarnings(r, opts),
  };
}

export function generatePlan(opts: PlanOptions): {
  planId: string;
  assigned: number;
  shortage: number;
  shortages: PlanShortage[];
} {
  const r = computeAssignments(opts);
  if (r.items.length === 0) {
    throw new DistributionError(
      'Không gán được bài nào — mọi tài khoản đều đã dùng hết bài thuộc chủ đề của mình',
    );
  }
  const totalSlots = r.accounts.length * opts.days * opts.perDay;

  // Slot thieu bai van duoc ghi voi post_id NULL de nhin thay lo hong tren UI va trong sheet "thieu".
  const filled = new Set(r.items.map((i) => `${i.account_name}|${i.day_index}|${i.slot_index}`));
  const gapItems: Omit<PlanItemRow, 'id'>[] = [];
  for (let d = 0; d < opts.days; d++) {
    const date = addDays(opts.startDate, d);
    for (let slot = 0; slot < opts.perDay; slot++) {
      for (const a of r.accounts) {
        if (filled.has(`${a.name}|${d}|${slot}`)) continue;
        gapItems.push({
          plan_id: r.planId,
          day_index: d,
          slot_index: slot,
          post_date: date,
          account_id: a.id,
          account_name: a.name,
          post_id: null,
          topic: null,
          caption_variant: null,
        });
      }
    }
  }

  insertPlan(
    {
      id: r.planId,
      name: opts.name?.trim() || null,
      start_date: opts.startDate,
      days: opts.days,
      per_day: opts.perDay,
      topics: opts.topics && opts.topics.length > 0 ? JSON.stringify(opts.topics) : null,
      account_count: r.accounts.length,
      planned: totalSlots,
      assigned: r.items.length,
      shortage: totalSlots - r.items.length,
      seed: r.seed,
      status: 'draft',
      created_at: new Date().toISOString(),
      exported_at: null,
    },
    [...r.items, ...gapItems],
  );

  return {
    planId: r.planId,
    assigned: r.items.length,
    shortage: totalSlots - r.items.length,
    shortages: r.shortages,
  };
}
