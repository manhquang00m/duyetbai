import ExcelJS from 'exceljs';
import { listPostingAccounts } from '../db/postingTopics';
import { SEEDING_COMMENTS } from './seedingComments';

/**
 * File Excel cho script GPM SeedingThreads (gpm_script/SeedingThreads):
 *   A = username cua chinh profile, B = account can vao xem/like/comment (cach nhau dau phay),
 *   C = comment da duyet (cach nhau dau | vi comment co the co dau phay - script tu nhan dien).
 * Script chi nhan username dang ^[A-Za-z0-9._]{1,30}$ va dung han neu o co ` hoac ${.
 */

// "Dang chay" = giong Phan phoi bai: Active, khong banned, 1 trong 4 trang thai dung duoc.
const SEEDING_STATUSES = new Set(['Live', 'Đang ngâm']);
const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;

export const SEEDING_MAX_PER_ROW = 50;
export const SEEDING_MAX_COMMENTS = 100;

export interface SeedingCandidate {
  id: number;
  name: string;
  platform: string | null;
  appeal_status: string | null;
  topics: string[];
  /** null = dung duoc; co gia tri = ly do bi loai (ten khong phai username Threads). */
  invalid: string | null;
}

export interface SeedingRow {
  profile: string;
  targets: string[];
  comments: string[];
}

export interface SeedingPlan {
  rows: SeedingRow[];
  /** So account moi profile xem thuc te (bi kep ve so account - 1). */
  perRow: number;
  commentsPerRow: number;
  seed: number;
  commentPool: number;
}

/** Account dang chay - ung vien cho file seeding (ke ca ten sai dinh dang, de UI bao ly do). */
export function listSeedingCandidates(): SeedingCandidate[] {
  return listPostingAccounts()
    .filter((a) => a.active === 1 && a.banned === 0 && SEEDING_STATUSES.has(a.appeal_status ?? ''))
    .map((a) => {
      const name = a.name.trim().replace(/^@/, '');
      return {
        id: a.id,
        name,
        platform: a.platform,
        appeal_status: a.appeal_status,
        topics: a.topics,
        invalid: USERNAME_RE.test(name) ? null : 'Tên không phải username Threads (chỉ chữ, số, dấu chấm, gạch dưới)',
      };
    });
}

/** PRNG co seed (mulberry32): cung seed -> cung ket qua, de ban xem truoc = file tai ve. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Xoay vong deu: xep ngau nhien n account thanh vong, chon ngau nhien k "buoc nhay" khac nhau
 * trong 1..n-1; profile o vi tri i xem cac account o vi tri i+d. Moi account vi the duoc xem
 * DUNG k lan, khong tu xem minh, khong trung trong 1 dong. Comment: moi dong boc rieng 1 mau
 * ngau nhien tu kho de cac profile khong comment giong nhau.
 * Chi nhan id thuoc danh sach ung vien hop le (server tu loc, khong tin id client gui).
 */
export function buildSeedingPlan(opts: {
  accountIds: number[];
  perRow: number;
  commentsPerRow: number;
  seed: number;
}): SeedingPlan {
  const wanted = new Set(opts.accountIds);
  const names = listSeedingCandidates()
    .filter((c) => !c.invalid && wanted.has(c.id))
    .map((c) => c.name);
  const rand = rng(opts.seed);
  const n = names.length;
  const k = Math.max(0, Math.min(opts.perRow, n - 1));
  const commentsPerRow = Math.min(opts.commentsPerRow, SEEDING_COMMENTS.length);

  const ring = shuffle(names, rand);
  const steps = shuffle(
    Array.from({ length: Math.max(0, n - 1) }, (_, i) => i + 1),
    rand,
  ).slice(0, k);

  const rows = ring.map((profile, i) => ({
    profile,
    targets: shuffle(
      steps.map((d) => ring[(i + d) % n]),
      rand,
    ),
    comments: commentsPerRow > 0 ? shuffle([...SEEDING_COMMENTS], rand).slice(0, commentsPerRow) : [],
  }));
  // Xuat theo ten A-Z cho de doi chieu voi danh sach profile tren GPM
  rows.sort((a, b) => a.profile.localeCompare(b.profile));

  return { rows, perRow: k, commentsPerRow, seed: opts.seed, commentPool: SEEDING_COMMENTS.length };
}

export async function seedingXlsxBuffer(plan: SeedingPlan): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('seeding');
  ws.columns = [
    { header: 'Profile', width: 24 },
    { header: 'Targets', width: 80 },
    { header: 'Comments', width: 80 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of plan.rows) ws.addRow([r.profile, r.targets.join(','), r.comments.join('|')]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
