import { useRef, type ChangeEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileDown, Download, Upload, Loader2 } from 'lucide-react'
import {
  importShopee,
  fetchShopeeLinks,
  exportShopeeUrl,
  exportPostsUrl,
  type ShopeeLinkRow,
} from '@/lib/api'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function ShopeePage() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const { data: links } = useQuery({ queryKey: ['shopee-links'], queryFn: fetchShopeeLinks })

  const importMut = useMutation({
    mutationFn: (file: File) => importShopee(file),
    onSuccess: (res) => {
      toast.success(`Đã cập nhật ${res.updated} link mới`, {
        description: `Cột file: ${res.headers.join(' | ')}`,
      })
      qc.invalidateQueries({ queryKey: ['shopee-links'] })
      qc.invalidateQueries({ queryKey: ['posts'] })
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Lỗi import'),
  })

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) importMut.mutate(f)
    e.target.value = ''
  }

  const rows = links ?? []
  const updated = rows.filter((r) => r.new_link).length

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shopee & Export</h1>
        <p className="text-sm text-muted-foreground">
          Xuất link gốc cho Shopee → gen link mới → import lại → xuất file đăng bài
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">1. Xuất link gốc</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              File [Liên kết gốc | Sub_id] để đưa lên Shopee gen link.
            </p>
            <a href={exportShopeeUrl} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              <FileDown className="h-4 w-4" /> shopee_input.xlsx
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">2. Import link mới</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Tải file Shopee trả về (link mới ở cột G) lên đây.
            </p>
            <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={onFile} />
            <Button
              variant="outline"
              size="sm"
              disabled={importMut.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {importMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Chọn file...
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">3. Xuất file đăng</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              File posts.xlsx cho tool auto đăng (Comment dùng link mới).
            </p>
            <a href={exportPostsUrl} className={cn(buttonVariants({ size: 'sm' }))}>
              <Download className="h-4 w-4" /> posts.xlsx
            </a>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Link Shopee</h2>
          <span className="text-sm text-muted-foreground">
            {updated}/{rows.length} đã có link mới
          </span>
        </div>
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 text-left font-medium">Post</th>
                  <th className="p-3 text-left font-medium">Link gốc</th>
                  <th className="p-3 text-left font-medium">Link mới</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: ShopeeLinkRow, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="whitespace-nowrap p-3 font-mono text-xs">{r.post_id}</td>
                    <td className="max-w-xs truncate p-3 text-muted-foreground">{r.link}</td>
                    <td className="max-w-xs truncate p-3">
                      {r.new_link ? (
                        <span className="text-green-600 dark:text-green-400">{r.new_link}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-muted-foreground">
                      Chưa có link shopee nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
