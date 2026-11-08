import type { MediaFilter } from '@/lib/api'

/** Lua chon bo loc media - dung chung trang Bai viet va Ke hoach thu cong. */
export const MEDIA_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'imageOnly', label: 'Chỉ có ảnh' },
  { value: 'videoOnly', label: 'Chỉ có video' },
  { value: 'complete', label: 'Đủ cả ảnh & video' },
  { value: 'missing', label: 'Thiếu ảnh hoặc video' },
] as const satisfies readonly { value: MediaFilter | 'all'; label: string }[]

export const MEDIA_VALUES = MEDIA_OPTIONS.map((o) => o.value)
export type MediaFilterValue = (typeof MEDIA_OPTIONS)[number]['value']
