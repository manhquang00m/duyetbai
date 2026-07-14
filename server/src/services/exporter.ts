import path from 'node:path';
import ExcelJS from 'exceljs';
import { db } from '../db';
import { listActiveAccounts } from '../db/accounts';
import { assignAccountAndMarkExported, touchExportedAt } from '../db/repository';
import { getSetting, setSetting } from '../db/settings';
import { HAS_VIDEO, HAS_IMAGE } from '../db/queries';
import { cleanSubId } from '../utils/postId';
import { DOWNLOAD_DIR } from '../config';

/**
 * Buoc 1: xuat file cho Shopee gen link moi.
 * Dung dinh dang Shopee yeu cau: sheet ten "Sheet 1", cot A = link goc,
 * cot B->F = Sub_id1..Sub_id5 (Sub_id1 = POST_ID da lam sach ky tu dac biet).
 * Moi link 1 dong (bai co N link -> N dong, cung Sub_id1).
 */
export async function exportShopeeInput(
  filePath: string,
  opts: { onlyMissing?: boolean } = {},
): Promise<number> {
  const where = opts.onlyMissing
    ? "WHERE link IS NOT NULL AND link <> '' AND (new_link IS NULL OR new_link = '')"
    : "WHERE link IS NOT NULL AND link <> ''";
  const rows = db
    .prepare(`SELECT DISTINCT link, post_id FROM shopee_entries ${where} ORDER BY post_id`)
    .all() as { link: string; post_id: string }[];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['Liên kết gốc', 'Sub_id1', 'Sub_id2', 'Sub_id3', 'Sub_id4', 'Sub_id5']);
  for (const r of rows) ws.addRow([r.link, cleanSubId(r.post_id), '', '', '', '']);

  await wb.xlsx.writeFile(filePath);
  return rows.length;
}

// Xoa cac doan link shopee (ke ca bi cat "…") khoi text comment.
const SHOPEE_TOKEN_RE = /(?:https?:\/\/)?(?:[\w-]+\.)*(?:shopee\.vn|shp\.ee)\/?\S*(?:[……]|\.\.\.)?/gi;

function stripShopeeTokens(text: string): string {
  return text.replace(SHOPEE_TOKEN_RE, ' ').replace(/\s+/g, ' ').trim();
}

const mediaFor = db.prepare(
  'SELECT type, file FROM media WHERE post_id = ? AND ok = 1 ORDER BY id',
);
const entriesFor = db.prepare(
  'SELECT comment, link, new_link FROM shopee_entries WHERE post_id = ? ORDER BY id',
);

/** Comment cuoi: giu chu (bo link cu bi cat) + noi cac link MOI xuong duoi. */
function buildComment(postId: string): string {
  const entries = entriesFor.all(postId) as {
    comment: string;
    link: string;
    new_link: string | null;
  }[];

  const byComment = new Map<string, string[]>();
  for (const e of entries) {
    const link = e.new_link || e.link; // chua import thi tam dung link goc
    if (!byComment.has(e.comment)) byComment.set(e.comment, []);
    byComment.get(e.comment)!.push(link);
  }

  const blocks: string[] = [];
  for (const [text, links] of byComment) {
    const stripped = stripShopeeTokens(text);
    const uniq = [...new Set(links)];
    // Noi bang " \n" (khong chi "\n") de link luon co dau cach dung truoc,
    // tranh dinh vao chu truoc do neu noi xuoi doc newline bi mat.
    blocks.push([stripped, ...uniq].filter(Boolean).join(' \n'));
  }
  return blocks.join('\n\n');
}

/** Chi lay duong dan THU MUC chua video/anh (thu muc co the co nhieu file), khong liet ke tung file. */
function mediaPaths(postId: string, type: 'video' | 'image'): string {
  const files = mediaFor.all(postId) as { type: string; file: string }[];
  const match = files.find((f) => f.type === type);
  if (!match) return '';
  return path.join(DOWNLOAD_DIR, `post_${postId}`, path.dirname(match.file));
}

/** Con tro round-robin luu trong app_settings -> gan account tiep theo, tiep tuc vong xoay giua cac lan export. */
function nextRoundRobinIndex(total: number): number {
  const cur = Number(getSetting('round_robin_index') ?? '0') || 0;
  setSetting('round_robin_index', String(cur + 1));
  return ((cur % total) + total) % total;
}

/**
 * Buoc 4: xuat file cho tool auto dang.
 * Cot: AccountName | Caption | VideoPath | ImagePath | Comment | Topic | URL | POST_ID | TrangThai
 * AccountName: gan 1 LAN DUY NHAT (round-robin, tiep tuc vong xoay qua cac lan export) roi luu co dinh
 * vao DB - xuat lai khong doi account nua, tranh 2 lan xuat ra 2 file gan account khac nhau cho cung 1 bai.
 * Neu account cu bi xoa/tat/proxy Die (khong con trong danh sach active) thi gan lai account moi.
 * onlyUnposted: chi xuat cac bai chua danh dau "Da dang".
 * onlyCompleteMedia: chi xuat bai co du CA video lan anh (bo qua bai thieu 1 trong 2 loai).
 */
export async function exportPosts(
  filePath: string,
  opts: { onlyUnposted?: boolean; onlyCompleteMedia?: boolean } = {},
): Promise<number> {
  const conds: string[] = [];
  if (opts.onlyUnposted) conds.push("p.post_status <> 'posted'");
  if (opts.onlyCompleteMedia) conds.push(`(${HAS_VIDEO} AND ${HAS_IMAGE})`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const posts = db
    .prepare(
      `SELECT p.post_id, p.url, p.caption, p.assigned_account, p.post_status
         FROM posts p ${where}
        ORDER BY p.scraped_at, p.post_id`,
    )
    .all() as {
    post_id: string;
    url: string;
    caption: string;
    assigned_account: string | null;
    post_status: string;
  }[];

  const accounts = listActiveAccounts();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('posts');
  ws.addRow([
    'AccountName',
    'Caption',
    'VideoPath',
    'ImagePath',
    'Comment',
    'Topic',
    'URL',
    'POST_ID',
    'TrangThai',
  ]);

  for (const p of posts) {
    let account = p.assigned_account;
    if (account && !accounts.includes(account)) account = null; // account cu het active/proxy Die -> gan lai

    if (!account && accounts.length) {
      account = accounts[nextRoundRobinIndex(accounts.length)];
      assignAccountAndMarkExported(p.post_id, account);
    } else if (account) {
      touchExportedAt(p.post_id);
    }

    ws.addRow([
      account ?? '',
      p.caption,
      mediaPaths(p.post_id, 'video'),
      mediaPaths(p.post_id, 'image'),
      buildComment(p.post_id),
      '', // Topic - de trong, dien tay sau
      p.url,
      p.post_id,
      p.post_status === 'posted' ? 'Đã đăng' : 'Đã xuất',
    ]);
  }

  ws.getColumn(2).alignment = { wrapText: true, vertical: 'top' }; // Caption
  ws.getColumn(5).alignment = { wrapText: true, vertical: 'top' }; // Comment

  await wb.xlsx.writeFile(filePath);
  return posts.length;
}
