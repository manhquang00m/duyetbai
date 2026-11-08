import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * Chieu cao toi da de phan tu `ref` vua khit man hinh (khi trang o dau): tu mep tren cua no toi day
 * viewport, tru cac phan tu dung SAU no (vd thanh phan trang) va padding duoi cua <main>.
 * Dung cho bang dai: dat style={{ maxHeight }} + overflow-y-auto -> cuon trong khung, trang khong dai ra.
 * Chi ap dung khi khop `query` (mac dinh >= xl); man hinh nho tra undefined = cuon theo trang nhu cu.
 */
export function useFitToViewport(
  ref: RefObject<HTMLElement | null>,
  { query = '(min-width: 1280px)', min = 320 }: { query?: string; min?: number } = {},
): number | undefined {
  const [height, setHeight] = useState<number | undefined>(undefined)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const mq = window.matchMedia(query)

    const calc = () => {
      if (!mq.matches) {
        setHeight(undefined)
        return
      }
      const top = el.getBoundingClientRect().top + window.scrollY
      // Moi thu nam DUOI phan tu khi trang cuon het: o tung cap tu no len <body>, cong cac anh em
      // dung sau (trong luong layout) + margin duoi cua chinh no + padding/vien duoi cua cha.
      let below = 0
      for (let node: HTMLElement = el; node.parentElement && node !== document.body; node = node.parentElement) {
        below += parseFloat(getComputedStyle(node).marginBottom) || 0
        for (let s = node.nextElementSibling; s; s = s.nextElementSibling) {
          const cs = getComputedStyle(s)
          if (cs.position === 'fixed' || cs.position === 'absolute' || cs.display === 'none') continue
          below += s.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom)
        }
        const pcs = getComputedStyle(node.parentElement)
        below += (parseFloat(pcs.paddingBottom) || 0) + (parseFloat(pcs.borderBottomWidth) || 0)
      }
      setHeight(Math.max(min, Math.floor(window.innerHeight - top - below)))
    }

    calc()
    // Bo loc phia tren xuong dong / thanh phan trang doi kich thuoc -> vi tri thay doi -> tinh lai
    const ro = new ResizeObserver(calc)
    if (el.parentElement) ro.observe(el.parentElement)
    window.addEventListener('resize', calc)
    mq.addEventListener('change', calc)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', calc)
      mq.removeEventListener('change', calc)
    }
  }, [ref, query, min])

  return height
}
