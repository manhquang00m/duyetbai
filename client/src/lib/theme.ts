export type Theme = 'light' | 'dark'

export function getTheme(): Theme {
  const saved = localStorage.getItem('theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem('theme', theme)
}

/** Goi truoc khi render de tranh nhap nhay theme. */
export function initTheme(): void {
  applyTheme(getTheme())
}
