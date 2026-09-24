import path from 'node:path';
import { db } from '../db';
import { DOWNLOAD_DIR } from '../config';

// Cac truong dung chung khi xuat file cho tool auto dang. Tach rieng khoi exporter.ts de
// module "Phan phoi bai" dung lai duoc ma khong keo theo duong round-robin/app_settings.
// Noi dung ben duoi giu NGUYEN VAN tu exporter.ts, khong doi logic.

// Xoa cac doan link shopee (ke ca bi cat "…") khoi text comment.
const SHOPEE_TOKEN_RE = /(?:https?:\/\/)?(?:[\w-]+\.)*(?:shopee\.vn|shp\.ee)\/?\S*(?:[……]|\.\.\.)?/gi;

export function stripShopeeTokens(text: string): string {
  return text.replace(SHOPEE_TOKEN_RE, ' ').replace(/\s+/g, ' ').trim();
}

const mediaFor = db.prepare(
  'SELECT type, file FROM media WHERE post_id = ? AND ok = 1 ORDER BY id',
);
const entriesFor = db.prepare(
  'SELECT comment, link, new_link FROM shopee_entries WHERE post_id = ? ORDER BY id',
);

/**
 * Comment cuoi: giu chu (bo link cu bi cat) + noi cac link MOI xuong duoi.
 * LUU Y: thieu new_link thi fallback ve link GOC -> day la ly do CLEAN_POST_COND
 * (db/queries.ts) bat buoc bai phai co new_link moi duoc dem di phan phoi.
 */
export function buildComment(postId: string): string {
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
export function mediaPaths(postId: string, type: 'video' | 'image'): string {
  const files = mediaFor.all(postId) as { type: string; file: string }[];
  const match = files.find((f) => f.type === type);
  if (!match) return '';
  return path.join(DOWNLOAD_DIR, `post_${postId}`, path.dirname(match.file));
}
