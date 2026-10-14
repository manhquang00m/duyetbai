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
  dead_link_count: number
  oos_link_count: number
  unknown_link_count: number
  checked_link_count: number
  shopee_comment_count: number | null
  comment: string | null
  thumb: string | null
  assigned_account: string | null
  post_status: 'new' | 'exported' | 'posted'
  exported_at: string | null
  posted_at: string | null
  topic: string | null
  variant_count: number // so ban caption AI da viet lai (0..3)
  click_count: number // so click affiliate cua bai
  posted_count: number // so lan da dang thanh cong
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

export type AccountPlatform = 'Stable' | 'Global'

// Gia tri cot J/K cua file import account. PHAI khop server/src/db/accountEnums.ts.
export const PROXY_TYPES = [
  'Tạp hóa mmo',
  'Proxy trung gian - proxy.vn',
  'Local',
  'Proxy gốc - proxy.vn',
  'Data center - proxy.vn',
] as const

// Y nghia GIO LA "trang thai chung" cua account (khong con rieng ve khang) - xem
// server/src/db/accountEnums.ts. 'Die' la gia tri duy nhat tu dong danh dau banned luc import.
export const APPEAL_STATUSES = [
  'Kháng thành công',
  'Chưa kháng',
  'Die',
  'Đang kháng',
  'Live',
  'Chưa tạo nick',
  'Đang ngâm',
] as const

export type ProxyType = (typeof PROXY_TYPES)[number]
export type AppealStatus = (typeof APPEAL_STATUSES)[number]

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
  platform: AccountPlatform | null
  proxy_type: ProxyType | null
  appeal_status: AppealStatus | null
  note: string | null
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
  platform?: AccountPlatform | null
  proxy_type?: ProxyType | null
  appeal_status?: AppealStatus | null
  note?: string | null
}

export interface AccountImportResult {
  inserted: number
  updated: number
  skipped: number
  total: number
  invalidValues: number
  invalidValueDetails: { name: string; column: string; value: string }[]
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
  file?: string
  ip?: string
  ms?: number
  shopeeStatus?: ShopeeLinkStatus
  shopeeTitle?: string
  shopeeImage?: string
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
  // 1 bai (post_id) bi gan >1 chu de khac nhau trong chinh lan chay nay (hiem gap) - chi de canh bao.
  topicConflicts?: { postId: string; topics: string[] }[]
}

/** Trang thai kiem tra 1 link Shopee - khop voi ShopeeLinkStatus ben server. */
export type ShopeeLinkStatus = 'available' | 'dead' | 'out_of_stock' | 'unknown'

/** Nhan tieng Viet dung chung o moi cho hien trang thai link. */
export const SHOPEE_LINK_STATUS_LABEL: Record<ShopeeLinkStatus, string> = {
  available: 'Còn hàng',
  dead: 'Link chết',
  out_of_stock: 'Hết hàng',
  unknown: 'Cần xem lại',
}

export interface ShopeeLinkRow {
  id: number
  post_id: string
  comment: string
  link: string
  new_link: string | null
  link_status: ShopeeLinkStatus | null
  link_message: string | null
  link_checked_at: string | null
  product_title: string | null
  product_image: string | null
}

// ===== API calls =====

// Bo loc DUNG CHUNG giua danh sach (fetchPosts) va xuat file (exportPostsUrl/fetchExportPostsWarnings)
// - loc the nao tren UI thi xuat file y nhu the, khong con 2 bo tuy chon rieng biet.
/** Loc bai theo ket qua kiem tra link Shopee (bai co IT NHAT 1 link o trang thai do). */
export type LinkStatusFilter = 'bad' | 'dead' | 'out_of_stock' | 'review' | 'unchecked'

export interface PostFilterParams {
  search?: string
  username?: string // loc dung 1 tac gia (khac search: search la LIKE)
  noShopee?: boolean
  notUpdated?: boolean
  oneShopee?: boolean
  postStatus?: 'unposted' | 'posted'
  mediaFilter?: MediaFilter
  linkStatus?: LinkStatusFilter
  cleanOnly?: boolean
  rewritten?: 'yes' | 'no'
  scrapedFrom?: string // 'YYYY-MM-DD' - loc theo scraped_at (thoi diem thu thap), khong phai post_date
  scrapedTo?: string // 'YYYY-MM-DD', bao gom ca ngay nay
  topics?: string[]
}

export type MediaFilter = 'complete' | 'missing' | 'imageOnly' | 'videoOnly'

function postFilterQueryParams(filters: PostFilterParams) {
  return {
    search: filters.search || undefined,
    username: filters.username || undefined,
    noShopee: filters.noShopee ? 1 : undefined,
    notUpdated: filters.notUpdated ? 1 : undefined,
    oneShopee: filters.oneShopee ? 1 : undefined,
    postStatus: filters.postStatus,
    mediaFilter: filters.mediaFilter,
    linkStatus: filters.linkStatus,
    cleanOnly: filters.cleanOnly ? 1 : undefined,
    rewritten: filters.rewritten,
    scrapedFrom: filters.scrapedFrom || undefined,
    scrapedTo: filters.scrapedTo || undefined,
    topics: filters.topics && filters.topics.length > 0 ? filters.topics.join(',') : undefined,
  }
}

export type PostSort = 'newest' | 'likes' | 'clicks' | 'posted'

export async function fetchPosts(
  params: PostFilterParams & { limit?: number; offset?: number; sort?: PostSort },
) {
  const { data } = await api.get<PostsResponse>('/api/posts', {
    params: {
      ...postFilterQueryParams(params),
      limit: params.limit,
      offset: params.offset,
      sort: params.sort === 'newest' ? undefined : params.sort,
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

/** Kiem tra tinh trang link Shopee cua cac bai da chon (job nen + SSE). */
export async function checkShopeePostLinks(postIds: string[]) {
  const { data } = await api.post<{ jobId: string; total: number }>(
    '/api/posts/check-shopee-links',
    { postIds },
  )
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

/** Xuat Excel toan bo account, dung DUNG dinh dang cot nhu file import (import lai duoc ngay). */
export const exportAccountsUrl = '/api/accounts/export'

export interface ProxySyncChange {
  account: string
  oldProxy: string | null
  newProxy: string
  status?: 'live' | 'die'
  ip?: string
}

export interface ProxySyncResult {
  changed: ProxySyncChange[]
  uncheckedCount: number
  unmatchedAccounts: string[]
  skippedNoPlatform: string[]
  errors: { platform: string; error: string }[]
}

/** Doc proxy hien tai tu GPM Login (Global/Stable, khop theo ten profile) va cap nhat vao accounts. */
export async function syncGpmProxies() {
  const { data } = await api.post<ProxySyncResult>('/api/accounts/sync-gpm-proxies')
  return data
}

/** urlTopics: url (dung nguyen ban da trim, khop 1-1 voi urls) -> chu de gan cho tac gia cua url do. */
export async function startBatch(urls: string[], force = false, urlTopics?: Record<string, string>) {
  const { data } = await api.post<{ jobId: string; total: number }>('/api/batch', {
    urls,
    force,
    urlTopics,
  })
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

/**
 * Kiem tra tinh trang (con hang/het hang/khong ton tai) link Shopee, chay job nen.
 * entryIds: chi kiem tra cac dong da chon (chi xet new_link). Bo trong -> kiem tra tat ca.
 */
export async function startShopeeLinkCheckJob(entryIds?: number[]) {
  const { data } = await api.post<{ jobId: string; total: number }>(
    '/api/shopee/links/check-job',
    entryIds ? { entryIds } : {},
  )
  return data
}

export interface ShopeeLinkCheckResult {
  link: string
  status: ShopeeLinkStatus
  message: string
  title?: string
  image?: string
}

/** Kiem tra nhanh 1 link Shopee bat ky (khong can nam trong DB, khong luu ket qua). */
export async function checkShopeeLinkOnce(link: string) {
  const { data } = await api.post<ShopeeLinkCheckResult>('/api/shopee/check-link', { link })
  return data
}

// ===== Viet lai caption bang AI =====
export interface RewriteRow {
  id: number
  batch_id: string
  row_index: number
  original: string
  rewritten: string | null
  error: string | null
}

export interface RewriteBatchDetail {
  batchId: string
  fileName: string
  srcCol: number
  destCol: number
  rows: RewriteRow[]
}

/** Upload file Excel -> tao batch. srcCol mac dinh 2 (cot B = Caption). */
export async function uploadRewriteFile(file: File, srcCol?: number) {
  const form = new FormData()
  form.append('file', file)
  if (srcCol) form.append('srcCol', String(srcCol))
  const { data } = await api.post<{ batchId: string; total: number }>('/api/rewrite/upload', form)
  return data
}

export async function fetchRewriteBatch(batchId: string) {
  const { data } = await api.get<RewriteBatchDetail>(`/api/rewrite/${batchId}`)
  return data
}

/** Chay AI cho ca batch - theo doi tien trinh qua batchStreamUrl(jobId). */
export async function startRewriteJob(batchId: string) {
  const { data } = await api.post<{ jobId: string; total: number }>(`/api/rewrite/${batchId}/run`)
  return data
}

export async function rewriteRowAgain(rowId: number) {
  const { data } = await api.post<{ rewritten: string }>(`/api/rewrite/rows/${rowId}/run`)
  return data
}

export async function saveRewriteRow(rowId: number, rewritten: string) {
  const { data } = await api.patch<{ ok: boolean }>(`/api/rewrite/rows/${rowId}`, { rewritten })
  return data
}

export function rewriteExportUrl(batchId: string) {
  return `/api/rewrite/${batchId}/export`
}

export interface AiConfigInfo {
  keyCount: number
  models: string[]
}

/** Co dang cau hinh API key AI khong + danh sach model dang dung (KHONG phai so lieu usage that). */
export async function fetchAiConfig() {
  const { data } = await api.get<AiConfigInfo>('/api/rewrite/ai-config')
  return data
}

export async function fetchRewritePrompt() {
  const { data } = await api.get<{ prompt: string; default: string }>(
    '/api/settings/rewrite-prompt',
  )
  return data
}

export async function saveRewritePrompt(prompt: string) {
  const { data } = await api.put<{ prompt: string }>('/api/settings/rewrite-prompt', { prompt })
  return data
}

export const exportShopeeUrl = '/api/export/shopee'
export const exportPostsUrl = '/api/export/posts'

/** URL tai posts.xlsx theo DUNG bo loc dang ap dung tren trang Bai viet. */
export function buildExportPostsUrl(filters: PostFilterParams): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(postFilterQueryParams(filters))) {
    if (v !== undefined && v !== '') params.set(k, String(v))
  }
  const qs = params.toString()
  return qs ? `${exportPostsUrl}?${qs}` : exportPostsUrl
}

export interface ExportPostsWarnings {
  notUpdated: number
  multiComment: number
  badLink: number
  unknownLink: number
}

export async function fetchExportPostsWarnings(filters: PostFilterParams) {
  const { data } = await api.get<ExportPostsWarnings>('/api/export/posts/check', {
    params: postFilterQueryParams(filters),
  })
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
  proxy_type: ProxyType | null
  note: string | null
  account_names: string | null
  account_count: number
}

export async function checkProxies(proxies: string[]) {
  const { data } = await api.post<ProxyCheckResult[]>('/api/proxies/check', { proxies })
  return data
}

/** Kiem tra nhieu proxy dang job nen, tra jobId de theo doi tien trinh qua batchStreamUrl(jobId). */
export async function startProxyCheckJob(proxies: string[]) {
  const { data } = await api.post<{ jobId: string; total: number }>('/api/proxies/check-job', {
    proxies,
  })
  return data
}

export async function fetchProxies() {
  const { data } = await api.get<SavedProxy[]>('/api/proxies')
  return data
}

export interface SaveProxyItem {
  proxy: string
  status?: string
  ip?: string
  proxy_type?: ProxyType | null
  note?: string | null
}

export async function saveProxies(items: SaveProxyItem[]) {
  const { data } = await api.post<SavedProxy[]>('/api/proxies', { items })
  return data
}

/** Sua 1 proxy da luu. Doi chuoi proxy se doi luon o cac account dang dung no. */
export async function updateProxy(
  id: number,
  patch: { proxy?: string; proxy_type?: ProxyType | null; note?: string | null },
) {
  const { data } = await api.patch<SavedProxy[]>(`/api/proxies/${id}`, patch)
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

// ===== Cai dat: nen tang mac dinh lay metadata/media bai Threads =====
export type MediaSourceName = 'savethreads' | 'snapsave'

export async function fetchMediaSourceDefault() {
  const { data } = await api.get<{ default: MediaSourceName }>('/api/settings/media-source')
  return data.default
}

export async function setMediaSourceDefault(value: MediaSourceName) {
  const { data } = await api.put<{ default: MediaSourceName }>('/api/settings/media-source', {
    default: value,
  })
  return data.default
}

// ===== Chu de gan theo tac gia (username trich xuat tu URL bai) =====
export const ACCOUNT_TOPICS = [
  'Công nghệ',
  'Sản phẩm',
  'Makeup',
  'Chó mèo',
  'Hút view',
  'Khác',
  'Gây war',
  'Nhiều click',
  'Nhiều tim',
] as const

export type AccountTopic = (typeof ACCOUNT_TOPICS)[number]

/**
 * Gia tri dac biet dung trong PostFilterParams.topics de loc bai CHUA duoc gan chu de.
 * PHAI khop voi UNASSIGNED_TOPIC o server/src/db/queries.ts.
 */
export const UNASSIGNED_TOPIC = '__unassigned__'

export interface AccountTopicRow {
  username: string
  // Cac chu de KHAC NHAU dang xuat hien trong bai cua tac gia nay - moi BAI chi co dung 1 chu de,
  // nhung tac gia co the co nhieu bai o nhieu chu de khac nhau nen mang nay co the co >1 phan tu.
  topics: string[]
  post_count: number
}

export async function fetchAccountTopics() {
  const { data } = await api.get<AccountTopicRow[]>('/api/account-topics')
  return data
}

/** Ap 1 chu de cho TOAN BO bai hien co cua 1 tac gia (topic=null de xoa chu de khoi bai cua ho). */
export async function setAuthorTopic(username: string, topic: string | null) {
  const { data } = await api.post<AccountTopicRow[]>('/api/account-topics/author', {
    username,
    topic,
  })
  return data
}

/** Gan/bo chu de cho DUNG 1 bai (topic=null de bo gan) - dung cho o "Chủ đề" tren trang Bài viết. */
export async function setPostTopic(postId: string, topic: string | null) {
  await api.post('/api/account-topics/post', { postId, topic })
}

/** Gan/bo chu de cho NHIEU bai cung luc (toi da 500) - dung cho thanh thao tac chon nhieu o trang Bai viet. */
export async function setPostsTopic(postIds: string[], topic: string | null) {
  const { data } = await api.post<{ updated: number }>('/api/account-topics/posts', { postIds, topic })
  return data
}

// ===== Phan phoi bai =====
// LUU Y: chu de o day la chu de cua TAI KHOAN DANG (posting_account_topics), khac han
// ACCOUNT_TOPICS gan cho TUNG BAI (posts.topic) - chi dung chung bo 7 gia tri.

export interface PostingAccount {
  id: number
  name: string
  platform: AccountPlatform | null
  active: number
  banned: number
  appeal_status: string | null
  proxy: string | null
  proxy_status: string | null
  topics: AccountTopic[]
}

export interface AccountCapacity {
  id: number
  name: string
  topics: string[]
  poolSize: number
  demand: number
  deficit: number
}

export interface PlanShortage {
  accountName: string
  date: string
  dayIndex: number
  missing: number
}

export interface PlanPreview {
  accounts: AccountCapacity[]
  poolByTopic: Record<string, number>
  poolTotal: number
  totalSlots: number
  assignableSlots: number
  shortages: PlanShortage[]
  emptyTopics: string[]
  warnings: string[]
}

export interface DistributionPlan {
  id: string
  name: string | null
  start_date: string
  days: number
  per_day: number
  topics: string | null
  account_count: number
  planned: number
  assigned: number
  shortage: number
  seed: string
  status: string
  created_at: string
  exported_at: string | null
}

export interface PlanItem {
  id: number
  plan_id: string
  day_index: number
  slot_index: number
  post_date: string
  account_id: number | null
  account_name: string
  post_id: string | null
  topic: string | null
  caption_variant: number | null // ban caption da dung (1..VARIANT_COUNT), null = dung caption goc
}

export interface PlanOptions {
  days: number
  perDay: number
  startDate: string
  accountIds?: number[]
  topics?: string[]
  scrapedFrom?: string // 'YYYY-MM-DD' - chi lay bai co thoi diem thu thap trong khoang nay
  scrapedTo?: string // 'YYYY-MM-DD', bao gom ca ngay nay
  seed?: string
  name?: string
}

export interface DistributionPool {
  total: number
  byTopic: Record<string, number>
  emptyTopics: string[]
  excluded: Record<string, number>
}

export async function fetchPostingAccounts() {
  const { data } = await api.get<PostingAccount[]>('/api/distribution/accounts')
  return data
}

export async function bulkPostingTopics(
  accountIds: number[],
  topics: string[],
  mode: 'add' | 'remove' | 'replace',
) {
  const { data } = await api.post<PostingAccount[]>('/api/distribution/accounts/topics/bulk', {
    accountIds,
    topics,
    mode,
  })
  return data
}

export async function fetchDistributionPool() {
  const { data } = await api.get<DistributionPool>('/api/distribution/pool')
  return data
}

export async function previewDistribution(opts: PlanOptions) {
  const { data } = await api.post<PlanPreview>('/api/distribution/preview', opts)
  return data
}

export async function createDistributionPlan(opts: PlanOptions) {
  const { data } = await api.post<{
    planId: string
    assigned: number
    shortage: number
    shortages: PlanShortage[]
  }>('/api/distribution/plans', opts)
  return data
}

export async function fetchDistributionPlans() {
  const { data } = await api.get<DistributionPlan[]>('/api/distribution/plans')
  return data
}

export async function fetchDistributionPlan(id: string) {
  const { data } = await api.get<{ plan: DistributionPlan; items: PlanItem[] }>(
    `/api/distribution/plans/${id}`,
  )
  return data
}

export async function deleteDistributionPlan(id: string) {
  const { data } = await api.delete<{ ok: boolean }>(`/api/distribution/plans/${id}`)
  return data
}

export function distributionExportUrl(id: string) {
  return `/api/distribution/plans/${id}/export`
}

// ===== Viet lai caption kho bai (cung cho vao Phan phoi bai de tranh nhieu tai khoan
// dang y het 1 caption khi dung lai cung 1 bai) =====

export interface CaptionVariantStatus {
  post_id: string
  caption: string
  topic: string
  variant_count: number
}

export async function fetchCaptionVariantStatus() {
  const { data } = await api.get<CaptionVariantStatus[]>('/api/post-caption-variants/status')
  return data
}

export interface CaptionVariant {
  variant_index: number
  caption: string
}

export async function fetchCaptionVariants(postId: string) {
  const { data } = await api.get<CaptionVariant[]>(
    `/api/post-caption-variants/${encodeURIComponent(postId)}`,
  )
  return data
}

/** Chay hang loat - postIds bo trong = mac dinh chi lam bai chua du ban. Theo doi qua batchStreamUrl(jobId). */
export async function runCaptionVariantJob(postIds?: string[]) {
  const { data } = await api.post<{ jobId: string; total: number }>(
    '/api/post-caption-variants/run',
    { postIds },
  )
  return data
}

export async function runCaptionVariantForPost(postId: string) {
  const { data } = await api.post<{ ok: boolean }>(`/api/post-caption-variants/${postId}/run`)
  return data
}

export async function fetchVariantRewritePrompt() {
  const { data } = await api.get<{ prompt: string; default: string }>(
    '/api/settings/variant-rewrite-prompt',
  )
  return data
}

export async function saveVariantRewritePrompt(prompt: string) {
  const { data } = await api.put<{ prompt: string }>('/api/settings/variant-rewrite-prompt', {
    prompt,
  })
  return data
}

// ===== Hieu qua Affiliate (bao cao Click + Hoa hong Shopee) =====
// Tien tra ve milli-dong (so nguyen) - chia 1000 khi hien thi.

export type AffImportResult =
  | {
      kind: 'click' | 'commission'
      fileName: string
      rows: number
      inserted: number
      updated: number
      skipped: number
      unmatchedSubIds: number
      minTime: string | null
      maxTime: string | null
    }
  | { fileName: string; error: string }

export interface AffFilterParams {
  from: string
  to: string
  topics?: string[]
}

export interface AffSummary {
  clicks: number
  convertedClicks: number
  orders: number
  cancelledOrders: number
  pendingMilli: number
  completedMilli: number
  unmatchedClicks: number
  byReferrer: { referrer: string; clicks: number }[]
  daily: { date: string; clicks: number; orders: number; commission_milli: number }[]
  dailyByOrderDate: { date: string; orders: number; commission_milli: number }[]
  byOrderDate: { orders: number; cancelledOrders: number; pendingMilli: number; completedMilli: number }
}

export interface AffPostRow {
  post_id: string
  username: string | null
  caption: string | null
  topic: string | null
  url: string | null
  thumb: string | null
  clicks: number
  converted_clicks: number
  orders: number
  cancelled_orders: number
  pending_milli: number
  completed_milli: number
  first_click: string | null
  last_click: string | null
  referrers: Record<string, number>
  accounts: string[]
}

export interface AffUnmatchedRow {
  sub_id1: string
  clicks: number
  orders: number
  commission_milli: number
}

export interface AffOrderLine {
  order_id: string
  item_name: string | null
  shop_name: string | null
  quantity: number
  order_status: string | null
  product_status: string | null
  ordered_at: string | null
  completed_at: string | null
  clicked_at: string | null
  click_id: string | null
  order_value_milli: number
  net_commission_milli: number
}

export interface AffCoverage {
  imports: {
    id: number
    kind: string
    file_name: string
    rows: number
    inserted: number
    updated: number
    skipped: number
    min_time: string | null
    max_time: string | null
    imported_at: string
  }[]
  clickMin: string | null
  clickMax: string | null
  orderClickMin: string | null
  orderClickMax: string | null
}

const affParams = (f: AffFilterParams) => ({
  from: f.from,
  to: f.to,
  topics: f.topics && f.topics.length > 0 ? f.topics.join(',') : undefined,
})

export async function importAffiliateFiles(files: File[]) {
  const form = new FormData()
  for (const f of files) form.append('files', f)
  const { data } = await api.post<AffImportResult[]>('/api/affiliate/import', form)
  return data
}

export async function fetchAffSummary(f: AffFilterParams) {
  const { data } = await api.get<AffSummary>('/api/affiliate/summary', { params: affParams(f) })
  return data
}

export interface AffAccountRow {
  account: string | null
  clicks: number
  exact_clicks: number
  posts: number
  orders: number
  commission_milli: number
}

export async function fetchAffAccounts(f: AffFilterParams) {
  const { data } = await api.get<AffAccountRow[]>('/api/affiliate/accounts', { params: affParams(f) })
  return data
}

export async function fetchAffPosts(f: AffFilterParams) {
  const { data } = await api.get<{ posts: AffPostRow[]; unmatched: AffUnmatchedRow[] }>(
    '/api/affiliate/posts',
    { params: affParams(f) },
  )
  return data
}

export async function fetchAffPostDetail(postId: string, f: AffFilterParams) {
  const { data } = await api.get<{ orders: AffOrderLine[]; daily: { date: string; clicks: number }[] }>(
    `/api/affiliate/posts/${encodeURIComponent(postId)}`,
    { params: affParams(f) },
  )
  return data
}

export async function fetchAffCoverage() {
  const { data } = await api.get<AffCoverage>('/api/affiliate/coverage')
  return data
}

// ===== Nhat ky dang bai (tool auto bao ve qua /api/automation/post-results) =====
export type PostRunState = 'posted' | 'commented' | 'missing'

export interface PostRunDayRow {
  account_name: string
  appeal_status: string | null
  post_id: string
  caption_variant: number | null
  plan_name: string | null
  in_plan: boolean
  state: PostRunState
  posted_url: string | null
  posted_at: string | null
  reports: number
  last_reported_at: string | null
  caption: string | null
  thumb: string | null
}

export interface PostRunAccountRow {
  account_name: string
  appeal_status: string | null
  planned: number
  commented: number
  posted_only: number
  missing: number
  extra: number
}

export async function fetchPostRunsDay(date: string) {
  const { data } = await api.get<PostRunDayRow[]>('/api/post-runs/day', { params: { date } })
  return data
}

export async function fetchPostRunsAccounts(from: string, to: string) {
  const { data } = await api.get<PostRunAccountRow[]>('/api/post-runs/accounts', {
    params: { from, to },
  })
  return data
}

export interface PostRunViolation {
  id: number
  account_name: string
  appeal_status: string | null
  post_id: string // '' = khong ro bai
  posted_url: string | null
  posted_at: string | null // 'YYYY-MM-DD'
  message: string | null
  detected_at: string
  reports: number
  caption: string | null
}

export async function fetchPostRunViolations() {
  const { data } = await api.get<PostRunViolation[]>('/api/post-runs/violations')
  return data
}

export async function resolvePostRunViolation(id: number) {
  await api.post(`/api/post-runs/violations/${id}/resolve`)
}

// ===== Phan tich hieu qua dang bai (/api/insights) =====
export interface InsightCounts {
  runs: number
  clicks: number
  hits: number
}

export interface InsightGroup extends InsightCounts {
  key: string
  label: string
  orders: number
  commission_milli: number
}

export interface InsightDimension {
  id: string
  title: string
  note?: string
  ordered: boolean
  rows: InsightGroup[]
}

export interface InsightPost extends InsightCounts {
  post_id: string
  username: string | null
  caption: string | null
  topic: string | null
  url: string | null
  thumb: string | null
  likes: string | null
  total_runs: number
  orders: number
  commission_milli: number
  last_run: string | null
}

export interface InsightAccount extends InsightCounts {
  account: string
  status: string | null
  orders: number
  commission_milli: number
  recent: InsightCounts
  previous: InsightCounts
  last_click: string | null
}

export interface InsightsReport {
  from: string
  to: string
  dataUntil: string | null
  cutoff: string | null
  overview: InsightCounts & {
    orders: number
    commission_milli: number
    posts: number
    accounts: number
    unattributedClicks: number
  }
  trend: (InsightCounts & { date: string })[]
  dimensions: InsightDimension[]
  topPosts: InsightPost[]
  repostCandidates: InsightPost[]
  deadPosts: { count: number; runs: number; posts: InsightPost[] }
  accounts: InsightAccount[]
  lag: { label: string; clicks: number }[]
  lagMedianHours: number | null
  products: { item_name: string; shop_name: string | null; orders: number; commission_milli: number }[]
  insights: { tone: 'good' | 'bad' | 'info'; title: string; detail: string }[]
}

export async function fetchInsights(from: string, to: string) {
  const { data } = await api.get<InsightsReport>('/api/insights', { params: { from, to } })
  return data
}
