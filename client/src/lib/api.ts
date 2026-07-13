import axios from 'axios'

// baseURL rong -> di qua Vite proxy (/api, /media -> :3000)
export const api = axios.create()

// Server tra loi { error: "..." } khi that bai -> dua thong diep do vao err.message
// de moi noi dang bat `err instanceof Error ? err.message : ...` hien dung noi dung.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (axios.isAxiosError(err)) {
      const serverMsg = (err.response?.data as { error?: string } | undefined)?.error
      if (serverMsg) err.message = serverMsg
    }
    return Promise.reject(err)
  },
)

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
  distinct_comment_count: number
  new_count: number
  shopee_comment_count: number | null
  comment: string | null
  thumb: string | null
  assigned_account: string | null
  post_status: 'new' | 'exported' | 'posted'
  exported_at: string | null
  posted_at: string | null
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
  processedUrl?: string | null
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
  name: string // = Profile
  active: number
  banned: number
  device: string | null
  pass_threads: string | null
  gmail: string | null
  gmail_password: string | null
  proxy: string | null
  created_at: string
  proxy_status?: string | null // 'live' | 'die' | null (chua kiem tra)
  proxy_checked_at?: string | null
}

export interface AccountInput {
  name: string
  active?: boolean
  banned?: boolean
  device?: string | null
  pass_threads?: string | null
  gmail?: string | null
  gmail_password?: string | null
  proxy?: string | null
}

export interface AccountImportResult {
  inserted: number
  updated: number
  skipped: number
  total: number
  proxyConflicts: number
  proxyConflictDetails: { name: string; proxy: string; heldBy: string }[]
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
  postStatus?: 'new' | 'exported' | 'posted'
}) {
  const { data } = await api.get<PostsResponse>('/api/posts', {
    params: {
      search: params.search,
      limit: params.limit,
      offset: params.offset,
      noShopee: params.noShopee ? 1 : undefined,
      notUpdated: params.notUpdated ? 1 : undefined,
      oneShopee: params.oneShopee ? 1 : undefined,
      postStatus: params.postStatus,
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

// ===== Lam dep video =====
export interface BeautifyWatermark {
  text?: string
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
  opacity: number
  fontSize: number
  color: string
}

export interface BeautifyConfig {
  filter: 'none' | 'vivid' | 'warm' | 'cool' | 'bw' | 'vintage'
  brightness: number
  contrast: number
  saturation: number
  crop: 'none' | '1:1' | '9:16' | '4:5' | '16:9'
  rotate: number
  speed: number
  removeMetadata: boolean
  watermark?: BeautifyWatermark
}

export async function beautifyVideos(
  postIds: string[],
  config: BeautifyConfig,
  watermarkImage?: File | null,
) {
  const form = new FormData()
  form.append('postIds', JSON.stringify(postIds))
  form.append('config', JSON.stringify(config))
  if (watermarkImage) form.append('watermarkImage', watermarkImage)
  const { data } = await api.post<{ jobId: string; total: number }>('/api/posts/beautify', form)
  return data
}

export async function deletePosts(postIds: string[]) {
  const { data } = await api.post<{ deleted: number }>('/api/posts/delete', { postIds })
  return data
}

export async function markPostsPosted(postIds: string[], posted = true) {
  const { data } = await api.post<{ updated: number; posted: boolean }>('/api/posts/mark-posted', {
    postIds,
    posted,
  })
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

export async function createAccount(input: AccountInput) {
  const { data } = await api.post<Account[]>('/api/accounts', input)
  return data
}

export async function updateAccount(id: number, patch: Partial<AccountInput>) {
  const { data } = await api.patch<Account[]>(`/api/accounts/${id}`, patch)
  return data
}

export async function updateAccountActive(id: number, active: boolean) {
  return updateAccount(id, { active })
}

export async function deleteAccount(id: number) {
  const { data } = await api.delete<Account[]>(`/api/accounts/${id}`)
  return data
}

export async function deleteAccounts(ids: number[]) {
  const { data } = await api.post<{ deleted: number }>('/api/accounts/delete', { ids })
  return data
}

export async function importAccounts(file: File) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<AccountImportResult>('/api/accounts/import', form)
  return data
}

export async function startBatch(urls: string[], force = false) {
  const { data } = await api.post<{ jobId: string; total: number }>('/api/batch', { urls, force })
  return data
}

export function batchStreamUrl(jobId: string) {
  return `/api/batch/${jobId}/stream`
}

// ===== Lich su thu thap =====
export interface CollectHistoryRow {
  id: number
  url: string
  post_id: string | null
  ok: number
  skipped: number
  error: string | null
  attempted_at: string
}

export async function fetchCollectHistory(onlyFailed = false) {
  const { data } = await api.get<CollectHistoryRow[]>('/api/batch/history', {
    params: onlyFailed ? { onlyFailed: 1 } : undefined,
  })
  return data
}

export async function deleteCollectHistory(id: number) {
  const { data } = await api.delete<{ ok: boolean }>(`/api/batch/history/${id}`)
  return data
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

export interface ExportPostsWarnings {
  notUpdated: number
  multiComment: number
}

export async function fetchExportPostsWarnings() {
  const { data } = await api.get<ExportPostsWarnings>('/api/export/posts/check')
  return data
}

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
  account_names: string | null
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
