import { useSyncExternalStore } from 'react'

/** Ho so hien o sidebar. App khong co dang nhap -> chi luu tren trinh duyet nay (localStorage). */
export interface Profile {
  name: string
  /** Data URL anh da thu nho (png/jpeg/webp), null = dung chu cai dau cua ten. */
  avatar: string | null
}

const KEY = 'profile'
const EVENT = 'profile:change'
export const PROFILE_NAME_MAX = 40
export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const AVATAR_MAX_BYTES = 10 * 1024 * 1024
const AVATAR_PX = 128
const AVATAR_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/

const EMPTY: Profile = { name: '', avatar: null }
let cache: { raw: string | null; value: Profile } | null = null

// Doc lai tu localStorage, loc kieu tung truong (gia tri co the bi sua tay / hong).
// Cache theo chuoi goc de useSyncExternalStore nhan cung 1 object khi khong doi.
function read(): Profile {
  const raw = localStorage.getItem(KEY)
  if (cache && cache.raw === raw) return cache.value
  let value = EMPTY
  try {
    const p: unknown = raw ? JSON.parse(raw) : null
    if (p && typeof p === 'object') {
      const { name, avatar } = p as Record<string, unknown>
      value = {
        name: typeof name === 'string' ? name.slice(0, PROFILE_NAME_MAX) : '',
        avatar: typeof avatar === 'string' && AVATAR_RE.test(avatar) ? avatar : null,
      }
    }
  } catch {
    // JSON hong -> ho so trong
  }
  cache = { raw, value }
  return value
}

/** Nem loi khi localStorage day (QuotaExceededError) - ben goi bao cho nguoi dung. */
export function saveProfile(p: Profile): void {
  localStorage.setItem(KEY, JSON.stringify({ name: p.name.trim().slice(0, PROFILE_NAME_MAX), avatar: p.avatar }))
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb) // tab khac sua
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

export function useProfile(): Profile {
  return useSyncExternalStore(subscribe, read)
}

/** Cat giua thanh hinh vuong, thu ve 128px, nen webp (~5-10KB) cho vua localStorage. */
export async function imageToAvatar(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const side = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = AVATAR_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh')
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX)
  bmp.close()
  const url = canvas.toDataURL('image/webp', 0.85)
  if (!AVATAR_RE.test(url)) throw new Error('Không đọc được ảnh')
  return url
}
