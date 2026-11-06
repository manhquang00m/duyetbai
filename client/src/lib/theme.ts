export type Theme = 'light' | 'pink' | 'dark'

export const THEMES: { id: Theme; label: string; swatch: string }[] = [
  { id: 'light', label: 'Sáng', swatch: '#ffffff' },
  { id: 'pink', label: 'Hồng', swatch: '#f472a8' },
  { id: 'dark', label: 'Tối', swatch: '#111111' },
]

// Mau thanh trinh duyet tren mobile = mau khung (--frame) cua tung theme
const META_COLOR: Record<Theme, string> = { light: '#f9fbfc', pink: '#fff5f9', dark: '#000000' }

export function getTheme(): Theme {
  const saved = localStorage.getItem('theme')
  if (saved === 'light' || saved === 'pink' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('pink', theme === 'pink')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[theme])
  localStorage.setItem('theme', theme)
}

/** Goi truoc khi render de tranh nhap nhay theme. */
export function initTheme(): void {
  applyTheme(getTheme())
}
