import { useEffect, useState } from 'react'

/** Gia tri tre `ms` sau lan doi cuoi - dung cho o tim kiem goi server (khong ban request moi phim). */
export function useDebouncedValue<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}
