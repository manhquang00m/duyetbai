import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * 1 tham so URL: doc chuoi -> gia tri, ghi gia tri -> chuoi. Gia tri bang mac dinh thi KHONG ghi
 * len URL (link gon, va "Xoa tat ca" chi la xoa param).
 */
export interface Codec<T> {
  def: T
  parse(raw: string): T
  format(v: T): string
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000')

export const q = {
  str: (def = ''): Codec<string> => ({ def, parse: (r) => r, format: (v) => v }),
  /** CSV. Param rong ("status=") = danh sach rong, khac voi khong co param (= mac dinh). */
  list: (def: readonly string[] = []): Codec<string[]> => ({
    def: [...def],
    parse: (r) => (r === '' ? [] : r.split(',')),
    format: (v) => v.join(','),
  }),
  enum: <T extends string>(values: readonly T[], def: T): Codec<T> => ({
    def,
    parse: (r) => ((values as readonly string[]).includes(r) ? (r as T) : def),
    format: (v) => v,
  }),
  int: (def: number, min = 0): Codec<number> => ({
    def,
    parse: (r) => {
      const n = Number.parseInt(r, 10)
      return Number.isFinite(n) && n >= min ? n : def
    },
    format: (v) => String(v),
  }),
  bool: (def = false): Codec<boolean> => ({ def, parse: (r) => r === '1', format: (v) => (v ? '1' : '0') }),
}

type Schema = Record<string, Codec<unknown>>
type Values<S extends Schema> = { [K in keyof S]: S[K]['def'] }

function isDefaultValue<T>(codec: Codec<T>, v: T): boolean {
  if (Array.isArray(v)) return sameList(v, codec.def as unknown as string[])
  return v === codec.def
}

/**
 * State bo loc song tren URL: reload, Back/Forward, gui link deu giu nguyen bo loc.
 * `schema` phai la hang so ngoai component (tham chieu on dinh).
 * Ghi: mac dinh push 1 muc lich su; o go chu dung `{ replace: true }` de Back khong lui tung ky tu.
 */
export function useUrlState<S extends Schema>(schema: S) {
  const [params, setParams] = useSearchParams()

  const values = useMemo(() => {
    const out = {} as Values<S>
    for (const k of Object.keys(schema) as (keyof S)[]) {
      const raw = params.get(k as string)
      out[k] = raw === null ? schema[k].def : schema[k].parse(raw)
    }
    return out
  }, [params, schema])

  const set = useCallback(
    (patch: Partial<Values<S>>, opts?: { replace?: boolean }) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            const codec = schema[k]
            if (!codec) continue
            if (isDefaultValue(codec, v)) next.delete(k)
            else next.set(k, codec.format(v))
          }
          return next
        },
        { replace: opts?.replace },
      )
    },
    [schema, setParams],
  )

  /** Ve mac dinh: tat ca key trong schema, hoac chi cac key truyen vao. */
  const reset = useCallback(
    (keys?: (keyof S)[]) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        for (const k of keys ?? Object.keys(schema)) next.delete(k as string)
        return next
      })
    },
    [schema, setParams],
  )

  const isDefault = useCallback((k: keyof S) => isDefaultValue(schema[k], values[k]), [schema, values])

  return { values, set, reset, isDefault }
}
