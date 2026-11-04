import { useQuery } from '@tanstack/react-query'
import { fetchTopics } from '@/lib/api'

/** Ten chu de theo thu tu hien thi (rong khi dang tai). Dung chung cache ['topics'] voi trang Chu de. */
export function useTopics(): string[] {
  const { data } = useQuery({ queryKey: ['topics'], queryFn: fetchTopics, staleTime: 60_000 })
  return data?.map((t) => t.name) ?? []
}
