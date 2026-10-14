import { db } from './index';

// Sub_id Shopee chi mang post_id -> doi chieu nhat ky dang de biet click thuoc LUOT DANG nao:
// gan cho luot dang bai do gan nhat TRUOC thoi diem click. "Chac chan" khi trong ngay click chi
// 1 tai khoan da dang bai do; con lai la uoc doan hop ly nhat.

export interface Run {
  id: number;
  account: string;
  post_id: string;
  t: string; // 'YYYY-MM-DD HH:MM:SS' gio dang thuc te (fallback post_date)
  variant: number | null;
  nth: number; // lan dang thu may cua bai nay (tinh tren toan bo nhat ky)
}

export function loadRuns(): Map<string, Run[]> {
  const rows = db
    .prepare(
      `SELECT id, account_name AS account, post_id, caption_variant AS variant,
              COALESCE(posted_at, post_date || ' 00:00:00') AS t
         FROM post_runs WHERE status IN ('posted', 'commented') ORDER BY t, id`,
    )
    .all() as unknown as Omit<Run, 'nth'>[];
  const runsOf = new Map<string, Run[]>();
  for (const r of rows) {
    const list = runsOf.get(r.post_id) ?? [];
    list.push({ ...r, nth: list.length + 1 });
    runsOf.set(r.post_id, list);
  }
  return runsOf;
}

export function attribute(
  runsOf: Map<string, Run[]>,
  postId: string,
  at: string,
): { run: Run | null; exact: boolean } {
  const before = (runsOf.get(postId) ?? []).filter((r) => r.t <= at);
  if (before.length === 0) return { run: null, exact: false };
  const day = at.slice(0, 10);
  const sameDay = new Set(before.filter((r) => r.t.slice(0, 10) === day).map((r) => r.account));
  return { run: before[before.length - 1], exact: sameDay.size === 1 };
}
