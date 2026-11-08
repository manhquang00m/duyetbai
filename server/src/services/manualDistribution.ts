// Ke hoach THU CONG: nguoi dung tu chon bai cho tung nick thay vi de thuat toan auto random.
// Dung chung bang distribution_plans / distribution_items voi ke hoach auto -> xuat Excel,
// post_runs, thong ke click... chay y nguyen, khong can biet item do gan tay hay auto.
//
// Luat (khop voi auto, xem services/distribution.ts):
//   - 1 nick khong nhan TRUNG 1 bai trong CUNG 1 ngay            -> chan cung (DB ux_dist_date_account_post)
//   - 1 (bai, ban caption) chi dung 1 lan / ngay, moi nick       -> chan cung (DB ux_dist_date_post)
//   - khong dung lai (bai, ban caption) o ngay LIEN KE (D-1, D+1) -> CANH BAO, nguoi dung xac nhan
//     thi van gan (gan tay la de nguoi dung quyet, khong chan cung nhu auto).
import type { MediaFilter } from '../db/queries';
import {
  createManualPlan,
  getPlan,
  getPoolPost,
  getPlanItem,
  getPlanItemsDetailed,
  insertItem,
  deleteItem,
  updateItemVariant,
  recomputePlanStats,
  nextSlotIndex,
  listPoolPostsByLikes,
  loadUsageForPosts,
  postsWithVariantsAmong,
  variantUsageOfPost,
  inWriteTx,
  type PlanRow,
  type PoolPostRow,
  type UsageRow,
  type PlanItemDetail,
} from '../db/distribution';
import { listDistributionCandidates, type PostingAccount } from '../db/postingTopics';
import { DistributionError } from './distribution';
import { VARIANT_COUNT } from './postCaptionVariants';
import { addDays } from '../utils/dates';

export type CandidateState = 'ok' | 'gap' | 'same_account' | 'full';

export interface Use {
  date: string;
  account: string;
}

export interface ManualCandidate extends PoolPostRow {
  state: CandidateState;
  uses: Use[]; // cac lan dung quanh ngay dang chon (D-1..D+1) de UI giai thich canh bao
}

const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function diffDays(from: string, to: string): number {
  const t = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(to) - t(from)) / 86_400_000);
}

function requireManualPlan(planId: string): PlanRow {
  const plan = getPlan(planId);
  if (!plan) throw new DistributionError('Không tìm thấy kế hoạch', 404);
  if (plan.kind !== 'manual') {
    throw new DistributionError('Chỉ gán tay được trên kế hoạch thủ công');
  }
  return plan;
}

function dayIndexOf(plan: PlanRow, date: string): number {
  const idx = diffDays(plan.start_date, date);
  if (idx < 0 || idx >= plan.days) {
    throw new DistributionError(
      `Ngày ${fmtDay(date)} nằm ngoài kế hoạch (${fmtDay(plan.start_date)} → ${fmtDay(addDays(plan.start_date, plan.days - 1))})`,
    );
  }
  return idx;
}

/** Nick du dieu kien dang (active, khong banned, trang thai hop le, co chu de) - lay tu server, khong tin client. */
function requireAccount(accountId: number): PostingAccount {
  const acc = listDistributionCandidates().find((a) => a.id === accountId);
  if (!acc) {
    throw new DistributionError(
      'Nick không đủ điều kiện đăng (cần active, không bị ban, trạng thái hợp lệ và có chủ đề)',
    );
  }
  return acc;
}

const variantsOf = (postId: string, withVariants: Set<string>): (number | null)[] =>
  withVariants.has(postId) ? Array.from({ length: VARIANT_COUNT }, (_, i) => i + 1) : [null];

const vkey = (v: number | null) => v ?? 0;

interface Evaluation {
  state: CandidateState;
  uses: Use[];
  freeWindow: (number | null)[]; // ban caption khong dung o D-1, D, D+1 -> gan khong vi pham gi
  freeDay: (number | null)[]; // ban caption con trong rieng ngay D -> gan duoc neu chap nhan canh bao
}

function evaluate(
  postId: string,
  accountName: string,
  date: string,
  rows: UsageRow[],
  withVariants: Set<string>,
): Evaluation {
  const variants = variantsOf(postId, withVariants);
  const onDay = rows.filter((r) => r.post_date === date);
  const usedDay = new Set(onDay.map((r) => vkey(r.caption_variant)));
  const usedWindow = new Set(rows.map((r) => vkey(r.caption_variant)));
  const freeDay = variants.filter((v) => !usedDay.has(vkey(v)));
  const freeWindow = variants.filter((v) => !usedWindow.has(vkey(v)));
  const sameAccount = onDay.some((r) => r.account_name === accountName);
  const state: CandidateState = sameAccount
    ? 'same_account'
    : freeDay.length === 0
      ? 'full'
      : freeWindow.length === 0
        ? 'gap'
        : 'ok';
  const uses = rows.slice(0, 4).map((r) => ({ date: r.post_date, account: r.account_name }));
  return { state, uses, freeWindow, freeDay };
}

export function createManual(opts: { name?: string; startDate: string; days: number }): {
  planId: string;
} {
  return {
    planId: createManualPlan({
      name: opts.name?.trim() || null,
      startDate: opts.startDate,
      days: opts.days,
    }),
  };
}

export function listCandidates(opts: {
  planId: string;
  accountId: number;
  postDate: string;
  topics?: string[];
  search?: string;
  media?: MediaFilter;
  hideUsed?: boolean;
  limit: number;
  offset: number;
}): { total: number; items: ManualCandidate[]; topics: string[] } {
  const plan = requireManualPlan(opts.planId);
  dayIndexOf(plan, opts.postDate);
  const acc = requireAccount(opts.accountId);
  let topics = acc.topics;
  if (opts.topics && opts.topics.length > 0) {
    const bad = opts.topics.filter((t) => !acc.topics.includes(t));
    if (bad.length > 0) {
      throw new DistributionError(`Nick @${acc.name} không có chủ đề: ${bad.join(', ')}`);
    }
    topics = opts.topics;
  }
  const from = addDays(opts.postDate, -1);
  const to = addDays(opts.postDate, 1);
  const pool = listPoolPostsByLikes({
    topics,
    search: opts.search,
    media: opts.media,
    hideUsedFrom: opts.hideUsed ? from : undefined,
    hideUsedTo: opts.hideUsed ? to : undefined,
    limit: opts.limit,
    offset: opts.offset,
  });
  const ids = pool.items.map((p) => p.post_id);
  const usage = loadUsageForPosts(ids, from, to);
  const withVariants = postsWithVariantsAmong(ids);
  const byPost = new Map<string, UsageRow[]>();
  for (const u of usage) {
    if (!byPost.has(u.post_id)) byPost.set(u.post_id, []);
    byPost.get(u.post_id)!.push(u);
  }
  const items = pool.items.map((p) => {
    const ev = evaluate(p.post_id, acc.name, opts.postDate, byPost.get(p.post_id) ?? [], withVariants);
    return { ...p, state: ev.state, uses: ev.uses };
  });
  return { total: pool.total, items, topics: acc.topics };
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Error && /UNIQUE constraint failed/i.test(err.message);

export function addItem(opts: {
  planId: string;
  accountId: number;
  postDate: string;
  postId: string;
  confirmGap?: boolean;
  variant?: number | null; // dung cho "Hoan tac": gan lai dung ban caption cu neu con trong
}): PlanItemDetail {
  try {
    const itemId = inWriteTx(() => {
      const plan = requireManualPlan(opts.planId);
      const dayIndex = dayIndexOf(plan, opts.postDate);
      const acc = requireAccount(opts.accountId);
      const post = getPoolPost(opts.postId);
      if (!post) {
        throw new DistributionError(
          'Bài không còn trong kho sạch (link Shopee, ảnh hoặc chủ đề đã thay đổi)',
        );
      }
      if (!acc.topics.includes(post.topic)) {
        throw new DistributionError(
          `Bài thuộc chủ đề "${post.topic}", nick @${acc.name} không có chủ đề này`,
        );
      }

      const rows = loadUsageForPosts(
        [post.post_id],
        addDays(opts.postDate, -1),
        addDays(opts.postDate, 1),
      );
      const ev = evaluate(post.post_id, acc.name, opts.postDate, rows, postsWithVariantsAmong([post.post_id]));
      if (ev.state === 'same_account') {
        throw new DistributionError(`@${acc.name} đã có bài này ngày ${fmtDay(opts.postDate)}`, 409);
      }
      if (ev.state === 'full') {
        throw new DistributionError(
          `Bài đã dùng hết bản caption trong ngày ${fmtDay(opts.postDate)}`,
          409,
        );
      }
      if (ev.state === 'gap' && !opts.confirmGap) {
        throw new DistributionError(
          'Bài đã được dùng ở ngày liền kề — xác nhận để vẫn gán',
          409,
          'GAP_WARNING',
          { uses: ev.uses },
        );
      }

      // Uu tien ban caption khong vi pham gian ngay; trong do chon ban IT DUNG NHAT (giong auto)
      const pool = ev.freeWindow.length > 0 ? ev.freeWindow : ev.freeDay;
      let variant: number | null;
      if (opts.variant !== undefined && pool.some((v) => vkey(v) === vkey(opts.variant ?? null))) {
        variant = opts.variant ?? null;
      } else {
        const used = variantUsageOfPost(post.post_id);
        variant = [...pool].sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0))[0];
      }

      const id = insertItem({
        plan_id: plan.id,
        day_index: dayIndex,
        slot_index: nextSlotIndex(plan.id, acc.name, dayIndex),
        post_date: opts.postDate,
        account_id: acc.id,
        account_name: acc.name,
        post_id: post.post_id,
        topic: post.topic,
        caption_variant: variant,
      });
      recomputePlanStats(plan.id);
      return id;
    });
    return getPlanItemsDetailed(opts.planId).find((i) => i.id === itemId)!;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DistributionError('Bài vừa được gán ở nơi khác, tải lại danh sách rồi thử lại', 409);
    }
    throw err;
  }
}

export function removeItem(planId: string, itemId: number): PlanItemDetail {
  return inWriteTx(() => {
    requireManualPlan(planId);
    const item = getPlanItemsDetailed(planId).find((i) => i.id === itemId);
    if (!item) throw new DistributionError('Không tìm thấy bài trong kế hoạch', 404);
    deleteItem(planId, itemId);
    recomputePlanStats(planId);
    return item; // tra lai de client lam "Hoan tac"
  });
}

export function setItemVariant(planId: string, itemId: number, variant: number | null): void {
  try {
    inWriteTx(() => {
      requireManualPlan(planId);
      const item = getPlanItem(planId, itemId);
      if (!item || !item.post_id) throw new DistributionError('Không tìm thấy bài trong kế hoạch', 404);
      const withVariants = postsWithVariantsAmong([item.post_id]);
      if (variant !== null && !withVariants.has(item.post_id)) {
        throw new DistributionError('Bài này chưa có bản caption viết lại');
      }
      const clash = loadUsageForPosts([item.post_id], item.post_date, item.post_date).find(
        (r) => r.item_id !== itemId && vkey(r.caption_variant) === vkey(variant),
      );
      if (clash) {
        throw new DistributionError(
          `Bản caption này đã dùng ngày ${fmtDay(item.post_date)} cho @${clash.account_name}`,
          409,
        );
      }
      updateItemVariant(planId, itemId, variant);
      recomputePlanStats(planId);
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DistributionError('Bản caption này vừa được dùng ở nơi khác trong ngày', 409);
    }
    throw err;
  }
}
