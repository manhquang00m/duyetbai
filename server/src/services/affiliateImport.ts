import ExcelJS from 'exceljs';
import { db } from '../db/index';
import { parseMilli } from '../utils/money';
import { cleanSubId } from '../utils/postId';

// Import 2 bao cao CSV xuat tu Shopee Affiliate dashboard:
//   - WebsiteClickReport  (1 dong = 1 click)
//   - AffiliateCommissionReport (1 dong = 1 san pham trong 1 don)
// Tu nhan loai file theo header, map cot theo TEN header (khong theo vi tri) de Shopee them/doi
// thu tu cot van chay.

export type AffImportKind = 'click' | 'commission';

export interface AffImportResult {
  kind: AffImportKind;
  fileName: string;
  rows: number;
  inserted: number;
  updated: number;
  skipped: number;
  unmatchedSubIds: number; // so Sub_id1 KHAC NHAU trong file khong khop bai nao
  minTime: string | null;
  maxTime: string | null;
}

/** Loi do file (sai dinh dang/thieu cot) -> API tra 400 kem thong diep nay. */
export class AffImportError extends Error {}

const CLICK_COLS = {
  clickId: 'Click id',
  clickedAt: 'Thời gian Click',
  region: 'Khu vực Click',
  subId: 'Sub_id',
  referrer: 'Người giới thiệu',
} as const;
const CLICK_REQUIRED: (keyof typeof CLICK_COLS)[] = ['clickId', 'clickedAt', 'subId'];

const COMMISSION_COLS = {
  orderId: 'ID đơn hàng',
  orderStatus: 'Trạng thái đặt hàng',
  checkoutId: 'Checkout id',
  orderedAt: 'Thời Gian Đặt Hàng',
  completedAt: 'Thời gian hoàn thành',
  clickedAt: 'Thời gian Click',
  shopName: 'Tên Shop',
  shopId: 'Shop id',
  itemId: 'Item id',
  itemName: 'Tên Item',
  modelId: 'ID Model',
  price: 'Giá(₫)',
  quantity: 'Số lượng',
  orderValue: 'Giá trị đơn hàng (₫)',
  refund: 'Số tiền hoàn trả (₫)',
  netCommission: 'Hoa hồng ròng tiếp thị liên kết(₫)',
  productStatus: 'Trạng thái sản phẩm liên kết',
  attributionType: 'Loại thuộc tính',
  buyerStatus: 'Trạng thái người mua',
  sub1: 'Sub_id1',
  sub2: 'Sub_id2',
  sub3: 'Sub_id3',
  sub4: 'Sub_id4',
  sub5: 'Sub_id5',
  channel: 'Kênh',
} as const;
const COMMISSION_REQUIRED: (keyof typeof COMMISSION_COLS)[] = [
  'orderId',
  'orderStatus',
  'itemId',
  'modelId',
  'clickedAt',
  'netCommission',
  'sub1',
];

// Header: bo BOM, gom khoang trang, NFC (tieng Viet dung/to hop), khong phan biet hoa-thuong.
const normHeader = (s: string) =>
  s.replace(/^﻿/, '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

const TIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const asTime = (v: string): string | null => (TIME_RE.test(v.trim()) ? v.trim() : null);
// NFC: so sanh trang thai don ('Đã hủy', 'Hoàn thành') o db/affiliate.ts phai khop tung byte.
const asText = (v: string): string | null => {
  const t = v.normalize('NFC').trim();
  return t && t !== '--' ? t : null;
};

async function readCsv(filePath: string): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  // map dong nhat: TAT tu doi kieu cua ExcelJS (ID dai, chuoi ngay, so le phai giu nguyen chuoi).
  const ws = await wb.csv.readFile(filePath, { map: (v: unknown) => v });
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = row.values as unknown[];
    const out: string[] = [];
    for (let i = 1; i < vals.length; i++) out.push(vals[i] == null ? '' : String(vals[i]));
    rows.push(out);
  });
  return rows;
}

function mapColumns<T extends Record<string, string>>(
  header: string[],
  cols: T,
  required: (keyof T)[],
): Record<keyof T, number> {
  const idx = new Map(header.map((h, i) => [normHeader(h), i]));
  const out = {} as Record<keyof T, number>;
  const missing: string[] = [];
  for (const key of Object.keys(cols) as (keyof T)[]) {
    out[key] = idx.get(normHeader(cols[key])) ?? -1;
    if (out[key] < 0 && required.includes(key)) missing.push(cols[key]);
  }
  if (missing.length > 0) {
    throw new AffImportError(`File thiếu cột bắt buộc: ${missing.join(', ')}`);
  }
  return out;
}

function detectKind(header: string[]): AffImportKind {
  const set = new Set(header.map(normHeader));
  if (set.has(normHeader(CLICK_COLS.clickId))) return 'click';
  if (set.has(normHeader(COMMISSION_COLS.orderId))) return 'commission';
  throw new AffImportError(
    'Không nhận ra loại file — cần file "Báo cáo Click" (có cột "Click id") hoặc "Báo cáo Hoa hồng" (có cột "ID đơn hàng") xuất từ Shopee Affiliate',
  );
}

function trackRange(r: { min: string | null; max: string | null }, t: string | null) {
  if (!t) return;
  if (!r.min || t < r.min) r.min = t;
  if (!r.max || t > r.max) r.max = t;
}

const insClick = db.prepare(`
  INSERT OR IGNORE INTO aff_clicks
    (click_id, clicked_at, region, referrer, sub_id_raw, sub_id1, sub_id2, sub_id3, sub_id4, sub_id5, import_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const orderExists = db.prepare(
  'SELECT 1 FROM aff_order_items WHERE order_id = ? AND item_id = ? AND model_id = ?',
);
const upsertOrder = db.prepare(`
  INSERT INTO aff_order_items
    (order_id, item_id, model_id, checkout_id, order_status, product_status, ordered_at, completed_at,
     clicked_at, shop_name, shop_id, item_name, quantity, price_milli, order_value_milli, refund_milli,
     net_commission_milli, attribution_type, buyer_status, channel, sub_id1, sub_id2, sub_id3, sub_id4,
     sub_id5, import_id, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(order_id, item_id, model_id) DO UPDATE SET
    checkout_id = excluded.checkout_id,
    order_status = excluded.order_status,
    product_status = excluded.product_status,
    ordered_at = excluded.ordered_at,
    completed_at = excluded.completed_at,
    clicked_at = excluded.clicked_at,
    shop_name = excluded.shop_name,
    shop_id = excluded.shop_id,
    item_name = excluded.item_name,
    quantity = excluded.quantity,
    price_milli = excluded.price_milli,
    order_value_milli = excluded.order_value_milli,
    refund_milli = excluded.refund_milli,
    net_commission_milli = excluded.net_commission_milli,
    attribution_type = excluded.attribution_type,
    buyer_status = excluded.buyer_status,
    channel = excluded.channel,
    sub_id1 = excluded.sub_id1,
    sub_id2 = excluded.sub_id2,
    sub_id3 = excluded.sub_id3,
    sub_id4 = excluded.sub_id4,
    sub_id5 = excluded.sub_id5,
    import_id = excluded.import_id,
    updated_at = excluded.updated_at
`);

const insImport = db.prepare(`
  INSERT INTO aff_imports (kind, file_name, rows, inserted, updated, skipped, min_time, max_time, imported_at)
  VALUES (?, ?, 0, 0, 0, 0, NULL, NULL, ?)
`);
const finishImport = db.prepare(`
  UPDATE aff_imports SET rows = ?, inserted = ?, updated = ?, skipped = ?, min_time = ?, max_time = ?
   WHERE id = ?
`);

/**
 * Doi chieu Sub_id1 -> post_id cho MOI dong chua khop (ke ca dong cua lan import truoc - bai co the
 * vua duoc cao sau do), roi noi don <-> click theo (sub_id1, thoi gian click) khop tung giay.
 * Sub_id1 = cleanSubId(post_id) (xem services/exporter.ts), nen map nguoc bang chinh ham do.
 */
function resolveLinks(): void {
  const byClean = new Map<string, string>();
  for (const r of db.prepare('SELECT post_id FROM posts').all() as { post_id: string }[]) {
    const k = cleanSubId(r.post_id);
    if (!byClean.has(k)) byClean.set(k, r.post_id);
  }
  for (const table of ['aff_clicks', 'aff_order_items'] as const) {
    const subs = db
      .prepare(`SELECT DISTINCT sub_id1 FROM ${table} WHERE post_id IS NULL AND sub_id1 IS NOT NULL`)
      .all() as { sub_id1: string }[];
    const upd = db.prepare(`UPDATE ${table} SET post_id = ? WHERE post_id IS NULL AND sub_id1 = ?`);
    for (const s of subs) {
      const postId = byClean.get(s.sub_id1);
      if (postId) upd.run(postId, s.sub_id1);
    }
  }
  db.exec(`
    UPDATE aff_order_items SET click_id = (
      SELECT c.click_id FROM aff_clicks c
       WHERE c.sub_id1 = aff_order_items.sub_id1 AND c.clicked_at = aff_order_items.clicked_at
       LIMIT 1
    )
    WHERE click_id IS NULL AND clicked_at IS NOT NULL
  `);
}

function countUnmatched(subIds: Set<string>): number {
  let n = 0;
  const q = db.prepare(
    'SELECT 1 FROM aff_clicks WHERE sub_id1 = ? AND post_id IS NOT NULL UNION SELECT 1 FROM aff_order_items WHERE sub_id1 = ? AND post_id IS NOT NULL LIMIT 1',
  );
  for (const s of subIds) if (!q.get(s, s)) n++;
  return n;
}

export async function importAffiliateCsv(
  filePath: string,
  fileName: string,
): Promise<AffImportResult> {
  const rows = await readCsv(filePath);
  if (rows.length === 0) throw new AffImportError('File rỗng');
  const [header, ...data] = rows;
  const kind = detectKind(header);
  const now = new Date().toISOString();
  const range = { min: null as string | null, max: null as string | null };
  const subIds = new Set<string>();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  db.exec('BEGIN');
  try {
    const importId = Number(insImport.run(kind, fileName, now).lastInsertRowid);

    if (kind === 'click') {
      const c = mapColumns(header, CLICK_COLS, CLICK_REQUIRED);
      const get = (row: string[], i: number) => (i >= 0 ? (row[i] ?? '') : '');
      for (const row of data) {
        const clickId = asText(get(row, c.clickId));
        const clickedAt = asTime(get(row, c.clickedAt));
        const subRaw = get(row, c.subId).trim();
        if (!clickId || !clickedAt) {
          skipped++;
          continue;
        }
        // "sub1-sub2-sub3-sub4-sub5" (vd "DdYxllPk4lr----")
        const subs = subRaw.split('-');
        const s = (i: number) => asText(subs[i] ?? '');
        const r = insClick.run(
          clickId,
          clickedAt,
          asText(get(row, c.region)),
          asText(get(row, c.referrer)),
          subRaw || null,
          s(0),
          s(1),
          s(2),
          s(3),
          s(4),
          importId,
        );
        if (Number(r.changes) > 0) inserted++;
        else skipped++; // da co tu lan import truoc
        trackRange(range, clickedAt);
        if (s(0)) subIds.add(s(0)!);
      }
    } else {
      const c = mapColumns(header, COMMISSION_COLS, COMMISSION_REQUIRED);
      const get = (row: string[], i: number) => (i >= 0 ? (row[i] ?? '') : '');
      for (const row of data) {
        const orderId = asText(get(row, c.orderId));
        const itemId = asText(get(row, c.itemId));
        const modelId = asText(get(row, c.modelId)) ?? '';
        if (!orderId || !itemId) {
          skipped++;
          continue;
        }
        const clickedAt = asTime(get(row, c.clickedAt));
        const sub1 = asText(get(row, c.sub1));
        const existed = !!orderExists.get(orderId, itemId, modelId);
        const qty = Number.parseInt(get(row, c.quantity), 10);
        upsertOrder.run(
          orderId,
          itemId,
          modelId,
          asText(get(row, c.checkoutId)),
          asText(get(row, c.orderStatus)),
          asText(get(row, c.productStatus)),
          asTime(get(row, c.orderedAt)),
          asTime(get(row, c.completedAt)),
          clickedAt,
          asText(get(row, c.shopName)),
          asText(get(row, c.shopId)),
          asText(get(row, c.itemName)),
          Number.isFinite(qty) ? qty : 0,
          parseMilli(get(row, c.price)),
          parseMilli(get(row, c.orderValue)),
          parseMilli(get(row, c.refund)),
          parseMilli(get(row, c.netCommission)),
          asText(get(row, c.attributionType)),
          asText(get(row, c.buyerStatus)),
          asText(get(row, c.channel)),
          sub1,
          asText(get(row, c.sub2)),
          asText(get(row, c.sub3)),
          asText(get(row, c.sub4)),
          asText(get(row, c.sub5)),
          importId,
          now,
        );
        if (existed) updated++;
        else inserted++;
        trackRange(range, clickedAt);
        if (sub1) subIds.add(sub1);
      }
    }

    resolveLinks();
    finishImport.run(data.length, inserted, updated, skipped, range.min, range.max, importId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    kind,
    fileName,
    rows: data.length,
    inserted,
    updated,
    skipped,
    unmatchedSubIds: countUnmatched(subIds),
    minTime: range.min,
    maxTime: range.max,
  };
}
