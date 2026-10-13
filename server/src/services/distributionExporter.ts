import ExcelJS from 'exceljs';
import { db } from '../db';
import { getPlan, getPlanItems, markPlanExported } from '../db/distribution';
import { CLEAN_POST_COND } from '../db/queries';
import { buildComment, mediaPaths } from './postExportFields';

const NEWS_LINKS = [
  'https://vnexpress.net',
  'https://tuoitre.vn',
  'https://thanhnien.vn',
  'https://vietnamnet.vn',
  'https://vtv.vn',
  'https://dantri.com.vn',
  'https://laodong.vn',
  'https://tienphong.vn',
  'https://nld.com.vn',
  'https://vov.vn',
  'https://baochinhphu.vn',
  'https://znews.vn',
  'https://cafef.vn',
];
const randomNewsLink = () => NEWS_LINKS[Math.floor(Math.random() * NEWS_LINKS.length)];

interface PostRow {
  post_id: string;
  url: string;
  caption: string;
  post_status: string;
}

const postFor = db.prepare(
  'SELECT post_id, url, caption, post_status FROM posts WHERE post_id = ?',
);

// Bai trong ke hoach GIO co con sach khong (link co the het hang sau khi lap ke hoach).
const stillClean = db.prepare(
  `SELECT COUNT(*) AS n FROM posts p WHERE p.post_id = ? AND ${CLEAN_POST_COND}`,
);
// Kiem tra lai ban caption luc XUAT (co the da bi xoa/viet lai lai sau khi lap ke hoach).
const variantCaption = db.prepare(
  'SELECT caption FROM post_caption_variants WHERE post_id = ? AND variant_index = ?',
);

export interface PlanExportResult {
  rows: number;
  skippedGaps: number; // slot thieu bai (post_id NULL)
  skippedDeleted: number; // bai da bi xoa khoi DB sau khi lap ke hoach
  dirtyNow: number; // bai khong con sach nua
  missingVariant: number; // da dinh dung ban viet lai nhung ban do khong con -> fallback caption goc
}

/**
 * Xuat file cho tool auto dang tu 1 ke hoach phan phoi.
 *
 * Cot A-I GIU NGUYEN Y HET posts.xlsx (tool ben ngoai map theo THU TU cot, doi la hong),
 * chi THEM cot J "Ngay dang" va cot K "Link" (link bao ngau nhien). Sheet van ten 'posts'.
 */
export async function exportPlanXlsx(
  planId: string,
  filePath: string,
): Promise<PlanExportResult> {
  const plan = getPlan(planId);
  if (!plan) throw new Error('Không tìm thấy kế hoạch');
  const items = getPlanItems(planId);

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
    'Ngày đăng',
    'Link',
  ]);

  let rows = 0;
  let skippedGaps = 0;
  let skippedDeleted = 0;
  let dirtyNow = 0;
  let missingVariant = 0;
  const gaps: { date: string; account: string }[] = [];

  for (const it of items) {
    if (!it.post_id) {
      skippedGaps++;
      gaps.push({ date: it.post_date, account: it.account_name });
      continue;
    }
    const p = postFor.get(it.post_id) as unknown as PostRow | undefined;
    if (!p) {
      skippedDeleted++;
      continue;
    }
    const clean = (stillClean.get(it.post_id) as unknown as { n: number }).n > 0;
    if (!clean) dirtyNow++;

    // Bai co ban viet lai duoc gan luc lap ke hoach -> dung dung ban do + danh hau to postId de
    // sau nay trace duoc dong nao dang ban nao. Kiem tra lai o day (khong tin item cu) phong
    // truong hop ban do da bi xoa/viet lai lai sau khi lap ke hoach.
    let caption = p.caption;
    let postIdOut = p.post_id;
    if (it.caption_variant) {
      const v = variantCaption.get(it.post_id, it.caption_variant) as
        | { caption: string }
        | undefined;
      if (v) {
        caption = v.caption;
        postIdOut = `${p.post_id}-v${it.caption_variant}`;
      } else {
        missingVariant++;
      }
    }

    ws.addRow([
      it.account_name,
      caption,
      mediaPaths(p.post_id, 'video'),
      mediaPaths(p.post_id, 'image'),
      buildComment(p.post_id),
      it.topic ?? '', // snapshot luc lap ke hoach - doi chu de tac gia sau nay khong viet lai lich su
      p.url,
      postIdOut,
      p.post_status === 'posted' ? 'Đã đăng' : 'Đã xuất',
      // Ghi CHUOI, khong phai Date: ExcelJS se xuat so serial (45678) va tool doc sai.
      it.post_date,
      randomNewsLink(),
    ]);
    rows++;
  }

  ws.getColumn(2).alignment = { wrapText: true, vertical: 'top' }; // Caption
  ws.getColumn(5).alignment = { wrapText: true, vertical: 'top' }; // Comment

  // Sheet phu liet ke slot trong - de sheet thu 2 nen tool doc worksheets[0]/'posts' khong anh huong.
  if (gaps.length > 0) {
    const gw = wb.addWorksheet('thieu');
    gw.addRow(['Ngày đăng', 'AccountName', 'Lý do']);
    for (const g of gaps) gw.addRow([g.date, g.account, 'Hết bài phù hợp trong kho']);
  }

  await wb.xlsx.writeFile(filePath);
  markPlanExported(planId);
  return { rows, skippedGaps, skippedDeleted, dirtyNow, missingVariant };
}
