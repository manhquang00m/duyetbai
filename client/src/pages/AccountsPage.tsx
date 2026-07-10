import { useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, Users } from 'lucide-react'
import {
  fetchAccounts,
  createAccount,
  updateAccountActive,
  deleteAccount,
  type Account,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'

export function AccountsPage() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const { data: accounts, isLoading } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['accounts'] })
    qc.invalidateQueries({ queryKey: ['stats'] })
  }

  const addMut = useMutation({
    mutationFn: (n: string) => createAccount(n),
    onSuccess: () => {
      setName('')
      invalidate()
      toast.success('Đã thêm account')
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Lỗi'),
  })

  const activeMut = useMutation({
    mutationFn: (v: { id: number; active: boolean }) => updateAccountActive(v.id, v.active),
    onSuccess: invalidate,
  })

  const delMut = useMutation({
    mutationFn: (id: number) => deleteAccount(id),
    onSuccess: () => {
      invalidate()
      toast.success('Đã xoá')
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (n) addMut.mutate(n)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="text-sm text-muted-foreground">
          Các account Threads để đăng bài (gán round-robin khi export)
        </p>
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <Input
          placeholder="Tên account, vd: shopvn_01"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" disabled={addMut.isPending || !name.trim()}>
          <Plus className="h-4 w-4" /> Thêm
        </Button>
      </form>

      <Card className="divide-y">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-4">
              <Skeleton className="h-4 w-40" />
            </div>
          ))}

        {!isLoading &&
          (accounts ?? []).map((a: Account) => (
            <div key={a.id} className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <Switch
                  checked={a.active === 1}
                  onCheckedChange={(v) => activeMut.mutate({ id: a.id, active: v })}
                />
                <span className={a.active ? 'font-medium' : 'text-muted-foreground line-through'}>
                  {a.name}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (confirm(`Xoá account "${a.name}"?`)) delMut.mutate(a.id)
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}

        {!isLoading && (accounts ?? []).length === 0 && (
          <EmptyState
            icon={Users}
            title="Chưa có account"
            description="Thêm account ở ô phía trên để dùng cho round-robin khi export."
          />
        )}
      </Card>
    </div>
  )
}
