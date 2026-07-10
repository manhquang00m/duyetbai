import { useEffect, useState } from 'react'

/** Đếm số tăng dần từ 0 -> target (easeOutCubic). */
export function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(0)

  useEffect(() => {
    let raf = 0
    let start = 0
    const step = (ts: number) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}
