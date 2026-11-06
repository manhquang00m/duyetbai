/**
 * Parse o dan hang loat (moi dong 1 muc) -> ket qua tung dong de hien gutter loi + tom tat
 * "12 hop le · 3 loi · 2 trung · 1 da co". Dong rong va dong bat dau bang # bi bo qua.
 */
export interface ParsedLine {
  line: number // 1-based
  raw: string
  /** Gia tri da chuan hoa se gui len server (chi co khi hop le). */
  value?: string
  /** Khoa so trung (khong phan biet cach viet). */
  key?: string
  error?: string
  dup?: boolean
  existing?: boolean
}

export interface ParseResult {
  lines: ParsedLine[]
  /** Gia tri hop le, khong trung, chua co - dung de submit. */
  values: string[]
  counts: { valid: number; invalid: number; dup: number; existing: number }
}

type LineParser = (raw: string) => { value: string; key: string } | { error: string }

function parseLines(text: string, parseOne: LineParser, existing?: ReadonlySet<string>): ParseResult {
  const lines: ParsedLine[] = []
  const seen = new Set<string>()
  const values: string[] = []
  const counts = { valid: 0, invalid: 0, dup: 0, existing: 0 }
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const raw = rawLine.trim()
    if (!raw || raw.startsWith('#')) return
    const r = parseOne(raw)
    const pl: ParsedLine = { line: i + 1, raw }
    if ('error' in r) {
      pl.error = r.error
      counts.invalid++
    } else {
      pl.value = r.value
      pl.key = r.key
      if (seen.has(r.key)) {
        pl.dup = true
        counts.dup++
      } else if (existing?.has(r.key)) {
        pl.existing = true
        counts.existing++
        seen.add(r.key)
      } else {
        seen.add(r.key)
        values.push(r.value)
        counts.valid++
      }
    }
    lines.push(pl)
  })
  return { lines, values, counts }
}

/** Giu lai dong hop le (bo dong loi / trung / da co) - cho nut "Bo dong loi". */
export function keepValidLines(result: ParseResult): string {
  return result.values.join('\n')
}

// --- Threads URL -------------------------------------------------------------------------------

const THREADS_POST = /^(?:https?:\/\/)?(?:www\.)?threads\.(?:net|com)\/@([^/?#\s]+)\/post\/([A-Za-z0-9_-]+)/i

/** Server lay @user + shortcode tu URL (server/src/utils/postId.ts) -> chuan hoa ve 1 dang, bo query. */
export function parseThreadsUrl(raw: string): { value: string; key: string } | { error: string } {
  const m = raw.match(THREADS_POST)
  if (!m) {
    if (/threads\.(net|com)\/@[^/]+\/?$/i.test(raw)) return { error: 'Link trang cá nhân, không phải link bài' }
    return { error: 'Không phải link bài Threads (…/@user/post/…)' }
  }
  return { value: `https://www.threads.com/@${m[1]}/post/${m[2]}`, key: m[2] }
}

export function parseThreadsUrls(text: string, existing?: ReadonlySet<string>): ParseResult {
  return parseLines(text, parseThreadsUrl, existing)
}

// --- Proxy -------------------------------------------------------------------------------------

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i

function validHostPort(host: string, port: string): string | null {
  if (!IPV4.test(host) && !HOSTNAME.test(host)) return `Host "${host}" không hợp lệ`
  const n = Number(port)
  if (!/^\d+$/.test(port) || n < 1 || n > 65535) return `Port "${port}" không hợp lệ`
  return null
}

/**
 * Nhan: ip:port · ip:port:user:pass · user:pass@ip:port · http(s)://[user:pass@]ip:port · socks5://…
 * Chuan hoa ve dang server doc duoc (server/src/utils/httpAgent.ts normalizeProxyUrl): ip:port hoac
 * ip:port:user:pass; giu nguyen URL khi user/pass co ':' hoac la socks.
 */
export function parseProxy(input: string): { value: string; key: string } | { error: string } {
  // Dan tu Excel: cot cach nhau bang tab
  const raw = input.replace(/\t+/g, ':').trim()
  let scheme = ''
  let rest = raw
  const sm = raw.match(/^([a-z0-9]+):\/\//i)
  if (sm) {
    scheme = sm[1].toLowerCase()
    if (!['http', 'https', 'socks4', 'socks5'].includes(scheme)) return { error: `Giao thức "${scheme}" không hỗ trợ` }
    rest = raw.slice(sm[0].length).replace(/\/+$/, '')
  }

  let host: string
  let port: string
  let user = ''
  let pass = ''
  const at = rest.lastIndexOf('@')
  if (at >= 0) {
    const auth = rest.slice(0, at)
    const hp = rest.slice(at + 1).split(':')
    if (hp.length !== 2) return { error: 'Thiếu port sau @' }
    ;[host, port] = hp
    const c = auth.indexOf(':')
    if (c < 0) return { error: 'Thiếu mật khẩu trước @' }
    user = auth.slice(0, c)
    pass = auth.slice(c + 1)
  } else {
    const parts = rest.split(':')
    if (parts.length === 2) [host, port] = parts
    else if (parts.length === 4) [host, port, user, pass] = parts
    else return { error: 'Sai định dạng — cần ip:port hoặc ip:port:user:pass' }
  }

  const bad = validHostPort(host, port)
  if (bad) return { error: bad }
  if ((user && !pass) || (!user && pass)) return { error: 'Thiếu user hoặc mật khẩu' }

  const key = `${host.toLowerCase()}:${port}:${user}`
  const needsUrl = (scheme && scheme !== 'http' && scheme !== 'https') || user.includes(':') || pass.includes(':')
  if (needsUrl) {
    const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : ''
    return { value: `${scheme || 'http'}://${auth}${host}:${port}`, key }
  }
  return { value: user ? `${host}:${port}:${user}:${pass}` : `${host}:${port}`, key }
}

export function parseProxies(text: string, existing?: ReadonlySet<string>): ParseResult {
  return parseLines(text, parseProxy, existing)
}

/** Khoa so trung cua 1 proxy da luu (cung cach tinh voi parseProxy). Chuoi la -> chinh no. */
export function proxyKey(p: string): string {
  const r = parseProxy(p)
  return 'key' in r ? r.key : p.trim().toLowerCase()
}

/** Chi host:port - chuoi proxy co the chua user/pass. */
export function proxyHost(p: string | null): string {
  if (!p) return '—'
  const noScheme = p.replace(/^[a-z0-9]+:\/\//i, '')
  const afterAuth = noScheme.includes('@') ? noScheme.slice(noScheme.lastIndexOf('@') + 1) : noScheme
  return afterAuth.split(':').slice(0, 2).join(':')
}

/** Hien thi proxy an mat khau: "1.2.3.4:8080 · user:••••". Nut copy van lay chuoi day du. */
export function maskProxy(p: string | null): string {
  if (!p) return '—'
  const r = parseProxy(p)
  if ('error' in r) return proxyHost(p)
  const user = r.key.split(':').slice(2).join(':')
  return user ? `${proxyHost(p)} · ${user}:••••` : proxyHost(p)
}

// --- Khac --------------------------------------------------------------------------------------

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
