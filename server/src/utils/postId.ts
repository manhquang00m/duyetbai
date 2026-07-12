/**
 * Trich "shortcode" tu URL bai Threads de dat ten folder output.
 * Vi du: https://www.threads.com/@baoyennn_1406/post/DMASTC8SVKz  ->  DMASTC8SVKz
 */
export function extractShortcode(url: string): string {
  const match = url.match(/\/post\/([A-Za-z0-9_-]+)/);
  if (!match) {
    throw new Error(`Khong tim thay post id trong URL: ${url}`);
  }
  return match[1];
}

/** Ten thu muc cho tung bai, vi du "post_DMASTC8SVKz". */
export function postFolderName(url: string): string {
  return `post_${extractShortcode(url)}`;
}

/**
 * Lam sach post_id de dung lam Sub_id khi xuat file cho Shopee (chi chap nhan chu+so,
 * post_id thuc te co the co "_"/"-" tu shortcode Threads).
 */
export function cleanSubId(postId: string): string {
  return postId.replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Trich username chu bai tu URL.
 * Vi du: https://www.threads.com/@baoyennn_1406/post/DMASTC8SVKz -> baoyennn_1406
 */
export function extractAuthor(url: string): string {
  const match = url.match(/\/@([^/?#]+)/);
  if (!match) {
    throw new Error(`Khong tim thay username trong URL: ${url}`);
  }
  return match[1];
}
