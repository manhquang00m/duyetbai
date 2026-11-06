import { checkProxies, saveProxies } from '@/lib/api'
import { parseProxy } from '@/lib/parsers'

/** Proxy dang chon: 1 proxy da luu (value '' = khong dung proxy), hoac 1 proxy moi go tay. */
export interface ProxyChoice {
  mode: 'select' | 'text'
  value: string
}

/** Loi cua proxy go tay (sai dinh dang). null = hop le hoac dang chon tu danh sach. */
export function proxyChoiceError(choice: ProxyChoice): string | null {
  if (choice.mode !== 'text' || !choice.value.trim()) return null
  const r = parseProxy(choice.value)
  return 'error' in r ? r.error : null
}

/**
 * Proxy go tay: kiem tra Live truoc, Die thi tra loi (khong luu), Live thi luu vao trang Proxy
 * luon. Tra ve chuoi proxy de gan cho account.
 */
export async function resolveTypedProxy(value: string): Promise<{ proxy: string } | { error: string }> {
  const [result] = await checkProxies([value])
  if (result.status !== 'live') return { error: `Proxy Die / không kết nối được (${result.error ?? 'không rõ lỗi'})` }
  await saveProxies([{ proxy: result.proxy, status: result.status, ip: result.ip }])
  return { proxy: result.proxy }
}
