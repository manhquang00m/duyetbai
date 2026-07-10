import axios from 'axios'

// baseURL rong -> di qua Vite proxy (/api, /media -> :3000)
export const api = axios.create()

// ===== Types (khop backend) =====
export interface PostListItem {
  post_id: string
  url: string
  username: string
  caption: string
  likes: string
  comments: string
  views: string
  post_date: string
  scraped_at: string
  scrape_error: string | null
  media_count: number
  shopee_count: number
  new_count: number
  shopee_comment_count: number | null
  comment: string | null
  thumb: string | null
}

export interface PostsResponse {
  total: number
  items: PostListItem[]
}

export interface MediaItem {
  type: string
  file: string
  ok: number
  error: string | null
  url: string
}

export interface ShopeeEntry {
  comment: string
  link: string
  new_link: string | null
}

export interface PostDetail {
  post: Record<string, unknown>
  media: MediaItem[]
  shopee: ShopeeEntry[]
}

export interface Account {
  id: number
  name: string
  active: number
  created_at: string
}

export interface BatchItemResult {
  url: string
  ok: boolean
  skipped?: boolean
  username?: string
  caption?: string
  mediaOk?: number
  mediaFail?: number
  entries?: number
  scrapeError?: string
  error?: string
}

export interface JobLog {
  url: string
  message: string
}

export interface JobState {
  id: string
  status: 'running' | 'done' | 'error'
  total: number
  done: number
  items: BatchItemResult[]
  logs: JobLog[]
  error?: string
}

export interface ShopeeLinkRow {
  post_id: string
  comment: string
  link: string
  new_link: string | null
}

// ===== API calls =====
export async function fetchPosts(params: {
  search?: string
  limit?: number
  offset?: number
  noShopee?: boolean
  notUpdated?: boolean
  oneShopee?: boolean
}) {
  const { data } = await api.get<PostsResponse>('/api/posts', {
    params: {
      search: params.search,
      limit: params.limit,
      offset: params.offset,
      noShopee: params.noShopee ? 1 : undefined,
      notUpdated: params.notUpdated ? 1 : undefined,
      oneShopee: params.oneShopee ? 1 : undefined,
    },
  })
  return data
}

export async function rescrapePosts(postIds: string[]) {
  const { data } = await api.post<{ jobId: string; total: number }>('/api/posts/rescrape', {
    postIds,
  })
  return data
}

export async function deletePosts(postIds: string[]) {
  const { data } = await api.post<{ deleted: number }>('/api/posts/delete', { postIds })
  return data
}

export async function fetchPost(id: string) {
  const { data } = await api.get<PostDetail>(`/api/posts/${id}`)
  return data
}

export async function fetchAccounts() {
  const { data } = await api.get<Account[]>('/api/accounts')
  return data
}

export async function createAccount(name: string) {
  const { data } = await api.post<Account[]>('/api/accounts', { name })
  return data
}

export async function updateAccountActive(id: number, active: boolean) {
  const { data } = await api.patch<Account[]>(`/api/accounts/${id}`, { active })
  return data
}

export async function deleteAccount(id: number) {
  const { data } = await api.delete<Account[]>(`/api/accounts/${id}`)
  return data
}

export async function startBatch(urls: string[], force = false) {
  const { data } = await api.post<{ jobId: string; total: number }>('/api/batch', { urls, force })
  return data
}

export function batchStreamUrl(jobId: string) {
  return `/api/batch/${jobId}/stream`
}

export async function importShopee(file: File) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<{ updated: number; headers: string[] }>(
    '/api/import/shopee',
    form,
  )
  return data
}

export async function fetchShopeeLinks() {
  const { data } = await api.get<ShopeeLinkRow[]>('/api/shopee/links')
  return data
}

export const exportShopeeUrl = '/api/export/shopee'
export const exportPostsUrl = '/api/export/posts'

export interface Stats {
  posts: number
  media: number
  shopee: number
  accounts: number
}

export async function fetchStats() {
  const { data } = await api.get<Stats>('/api/stats')
  return data
}

// ===== Proxies =====
export interface ProxyCheckResult {
  proxy: string
  status: 'live' | 'die'
  ip?: string
  ms?: number
  error?: string
}

export interface SavedProxy {
  id: number
  proxy: string
  status: string | null
  ip: string | null
  checked_at: string | null
  created_at: string
}

export async function checkProxies(proxies: string[]) {
  const { data } = await api.post<ProxyCheckResult[]>('/api/proxies/check', { proxies })
  return data
}

export async function fetchProxies() {
  const { data } = await api.get<SavedProxy[]>('/api/proxies')
  return data
}

export async function saveProxies(items: { proxy: string; status?: string; ip?: string }[]) {
  const { data } = await api.post<SavedProxy[]>('/api/proxies', { items })
  return data
}

export async function deleteProxy(id: number) {
  const { data } = await api.delete<SavedProxy[]>(`/api/proxies/${id}`)
  return data
}

export async function recheckProxy(id: number) {
  const { data } = await api.post<SavedProxy[]>(`/api/proxies/${id}/recheck`)
  return data
}
