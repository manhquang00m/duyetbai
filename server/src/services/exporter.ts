import path from 'node:path';
import ExcelJS from 'exceljs';
import { db } from '../db';
import { listActiveAccounts } from '../db/accounts';
import { DOWNLOAD_DIR } from '../config';

/**
 * Buoc 1: xuat file cho Shopee gen link moi.
 * Cot: "Lien ket goc" (link shopee goc) | "Sub_id" (= POST_ID cua bai).
 * Moi link 1 dong (bai co N link -> N dong, cung Sub_id).
 */
export async function exportShopeeInput(filePath: string): Promise<number> {
  const rows = db
    .prepare(
      `SELECT DISTINCT link, post_id
         FROM shopee_entries
        WHERE link IS NOT NULL AND link <> ''
        ORDER BY post_id`,
    )
    .all() as { link: string; post_id: string }[];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('shopee');
  ws.addRow(['Liên kết gốc', 'Sub_id']);
  for (const r of rows) ws.addRow([r.link, r.post_id]);

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
    blocks.push([stripped, ...uniq].filter(Boolean).join('\n'));
  }
  return blocks.join('\n\n');
}

function mediaPaths(postId: string, type: 'video' | 'image'): string {
  const files = mediaFor.all(postId) as { type: string; file: string }[];
  return files
    .filter((f) => f.type === type)
    .map((f) => path.join(DOWNLOAD_DIR, `post_${postId}`, f.file))
    .join(';');
}

/**
 * Buoc 4: xuat file cho tool auto dang.
 * Cot: AccountName | Caption | VideoPath | ImagePath | Comment | Topic | URL | POST_ID
 * AccountName gan round-robin theo danh sach account active; Topic de trong.
 */
export async function exportPosts(filePath: string): Promise<number> {
  const posts = db
    .prepare('SELECT post_id, url, caption FROM posts ORDER BY scraped_at, post_id')
    .all() as { post_id: string; url: string; caption: string }[];

  const accounts = listActiveAccounts();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('posts');
  ws.addRow(['AccountName', 'Caption', 'VideoPath', 'ImagePath', 'Comment', 'Topic', 'URL', 'POST_ID']);

  posts.forEach((p, i) => {
    const account = accounts.length ? accounts[i % accounts.length] : '';
    ws.addRow([
      account,
      p.caption,
      mediaPaths(p.post_id, 'video'),
      mediaPaths(p.post_id, 'image'),
      buildComment(p.post_id),
      '', // Topic - de trong, dien tay sau
      p.url,
      p.post_id,
    ]);
  });

  ws.getColumn(2).alignment = { wrapText: true, vertical: 'top' }; // Caption
  ws.getColumn(5).alignment = { wrapText: true, vertical: 'top' }; // Comment

  await wb.xlsx.writeFile(filePath);
  return posts.length;
}
