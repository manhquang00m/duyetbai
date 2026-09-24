import { db } from '../db';
import { getSetting, setSetting } from '../db/settings';
import { listCleanPostsWithTopic } from '../db/distribution';
import { maskLinks, unmaskLinks } from './rewrite';
import { chatComplete } from './llm';

export const VARIANT_COUNT = 3;

export const DEFAULT_VARIANT_PROMPT = [
  'Ban la copywriter tieng Viet chuyen viet caption ban hang affiliate.',
  `Nhiem vu: viet lai caption duoi day thanh ${VARIANT_COUNT} phien ban KHAC NHAU - khac ca ban`,
  'goc lan khac nhau giua cac phien ban voi nhau (khong chi doi vai tu).',
  'Yeu cau cho MOI phien ban:',
  '- Dien dat khac nhau ro ret, nhung giu dung y va thong tin san pham.',
  '- Giu nguyen moi hashtag va moi placeholder dang [[LINK1]], [[LINK2]]: khong sua, khong bo, khong them moi.',
  '- Khong bia them thong tin, gia, khuyen mai khong co trong ban goc.',
  '- Giu DUNG ten va loai san pham nhu ban goc, tuyet doi khong doi sang san pham khac.',
  '- Giu do dai tuong duong ban goc, viet bang tieng Viet co dau.',
  `Dinh dang tra ve: DUNG ${VARIANT_COUNT} dong, moi dong bat dau bang "1. ", "2. "... theo thu tu,`,
  'khong giai thich, khong tieu de, khong dong trong.',
].join('\n');

const VARIANT_PROMPT_KEY = 'variant_rewrite_prompt';

export function getVariantRewritePrompt(): string {
  return getSetting(VARIANT_PROMPT_KEY) || DEFAULT_VARIANT_PROMPT;
}

export function saveVariantRewritePrompt(prompt: string): void {
  setSetting(VARIANT_PROMPT_KEY, prompt || DEFAULT_VARIANT_PROMPT);
}

export interface VariantStatusRow {
  post_id: string;
  caption: string;
  topic: string;
  variant_count: number;
}

/**
 * Bai hop le cho viec viet lai (dung DUNG tap bai se duoc Phan phoi bai dung toi, khong lam gi
 * cho bai khong bao gio duoc phan phoi), kem so ban da co - bai CHUA DU 3 ban len dau de xu ly
 * truoc (cung tinh than uu tien "chua lam" nhu popup gan chu de theo tac gia).
 */
export function listVariantStatus(): VariantStatusRow[] {
  const clean = listCleanPostsWithTopic();
  if (clean.length === 0) return [];

  const captionOf = new Map(
    (
      db
        .prepare(
          `SELECT post_id, caption FROM posts WHERE post_id IN (${clean.map(() => '?').join(',')})`,
        )
        .all(...clean.map((c) => c.post_id)) as { post_id: string; caption: string }[]
    ).map((r) => [r.post_id, r.caption]),
  );
  const countOf = new Map(
    (
      db
        .prepare(
          `SELECT post_id, COUNT(*) AS n FROM post_caption_variants
            WHERE post_id IN (${clean.map(() => '?').join(',')}) GROUP BY post_id`,
        )
        .all(...clean.map((c) => c.post_id)) as { post_id: string; n: number }[]
    ).map((r) => [r.post_id, r.n]),
  );

  return clean
    .map((c) => ({
      post_id: c.post_id,
      caption: captionOf.get(c.post_id) ?? '',
      topic: c.topic,
      variant_count: countOf.get(c.post_id) ?? 0,
    }))
    .sort((a, b) => a.variant_count - b.variant_count);
}

/** Bai hop le nhung CHUA DU 3 ban - dung cho job hang loat (mac dinh khong lam lai bai da xong). */
export function listMissingPostIds(): string[] {
  return listVariantStatus()
    .filter((r) => r.variant_count < VARIANT_COUNT)
    .map((r) => r.post_id);
}

/** 3 ban caption da viet cho 1 bai (rong neu chua viet) - dung khi bung dong xem tren UI. */
export function listVariantsForPost(postId: string): { variant_index: number; caption: string }[] {
  return db
    .prepare(
      'SELECT variant_index, caption FROM post_caption_variants WHERE post_id = ? ORDER BY variant_index',
    )
    .all(postId) as { variant_index: number; caption: string }[];
}

const insertVariant = db.prepare(
  `INSERT INTO post_caption_variants (post_id, variant_index, caption, created_at)
   VALUES (?, ?, ?, ?)`,
);
const clearVariants = db.prepare('DELETE FROM post_caption_variants WHERE post_id = ?');
const countVariants = db.prepare(
  'SELECT COUNT(*) AS n FROM post_caption_variants WHERE post_id = ?',
);
const captionFor = db.prepare('SELECT caption FROM posts WHERE post_id = ?');

const LINE_RE = /^\s*(\d+)\.\s*(.+)$/gm;

/** Parse dung DUNG VARIANT_COUNT dong danh so 1..N - thieu/lech thi coi ca lan goi la loi. */
function parseVariants(text: string): string[] {
  const found = new Map<number, string>();
  for (const m of text.matchAll(LINE_RE)) {
    const idx = Number(m[1]);
    const body = m[2].trim();
    if (idx >= 1 && idx <= VARIANT_COUNT && body) found.set(idx, body);
  }
  if (found.size !== VARIANT_COUNT) {
    throw new Error(
      `AI tra ve ${found.size}/${VARIANT_COUNT} phien ban hop le - thu lai hoac sua prompt`,
    );
  }
  const out: string[] = [];
  for (let i = 1; i <= VARIANT_COUNT; i++) out.push(found.get(i)!);
  return out;
}

/**
 * Viet lai VARIANT_COUNT ban cho 1 bai bang 1 request AI duy nhat, luu ca 3 trong 1 transaction.
 * force=false: bo qua neu da du ban (tiet kiem quota khi chay hang loat).
 */
export async function generateVariantsForPost(
  postId: string,
  force = false,
): Promise<{ ok: boolean; error?: string }> {
  if (!force) {
    const n = (countVariants.get(postId) as { n: number }).n;
    if (n >= VARIANT_COUNT) return { ok: true };
  }

  const row = captionFor.get(postId) as { caption: string } | undefined;
  if (!row) return { ok: false, error: 'khong tim thay bai' };

  try {
    const { masked, links } = maskLinks(row.caption);
    const out = await chatComplete(getVariantRewritePrompt(), masked);
    const variants = parseVariants(out).map((v) => unmaskLinks(v, links));

    const now = new Date().toISOString();
    db.exec('BEGIN');
    try {
      clearVariants.run(postId);
      variants.forEach((caption, i) => insertVariant.run(postId, i + 1, caption, now));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return { ok: true };
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).split('\n')[0];
    return { ok: false, error: msg };
  }
}
