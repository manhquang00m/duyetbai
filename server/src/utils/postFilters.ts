import type { PostFilterOpts } from '../db/queries';

const truthy = (v: unknown): boolean => v === '1' || v === 'true';

/**
 * Doc bo loc bai viet tu query string - DUNG CHUNG giua GET /api/posts (danh sach) va
 * GET /api/export/posts* (xuat file) de dam bao "loc the nao tren UI, xuat y nhu the".
 */
export function parsePostFilterQuery(query: Record<string, unknown>): PostFilterOpts {
  const postStatusRaw = String(query.postStatus ?? '');
  const mediaFilterRaw = String(query.mediaFilter ?? '');
  // topics gui dang chuoi noi bang dau phay (vd "Công nghệ,Makeup") - don gian, khong phu thuoc
  // quy uoc serialize mang cua axios/qs.
  const topicsRaw = query.topics != null ? String(query.topics) : '';
  const topics = topicsRaw
    ? topicsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined;
  return {
    search: query.search != null ? String(query.search) : undefined,
    username: query.username != null ? String(query.username) : undefined,
    noShopee: truthy(query.noShopee),
    notUpdated: truthy(query.notUpdated),
    oneShopee: truthy(query.oneShopee),
    postStatus:
      postStatusRaw === 'unposted' || postStatusRaw === 'posted' ? postStatusRaw : undefined,
    mediaFilter:
      mediaFilterRaw === 'complete' || mediaFilterRaw === 'missing' ? mediaFilterRaw : undefined,
    topics,
  };
}
