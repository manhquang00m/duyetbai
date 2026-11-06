import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AccountAvatar } from '@/components/AccountAvatar'
import {
  AVATAR_MAX_BYTES,
  AVATAR_TYPES,
  imageToAvatar,
  PROFILE_NAME_MAX,
  saveProfile,
  useProfile,
  type Profile,
} from '@/lib/profile'
import { cn } from '@/lib/utils'

/** Anh tai len > chu cai dau cua ten (cung mau voi avatar nick) > icon nguoi khi chua dat ten. */
function ProfileAvatar({ profile, large }: { profile: Profile; large?: boolean }) {
  const size = large ? 'h-16 w-16' : 'h-8 w-8'
  if (profile.avatar)
    return <img src={profile.avatar} alt="" className={cn(size, 'shrink-0 rounded-full border object-cover')} />
  if (profile.name.trim())
    return <AccountAvatar name={profile.name.trim()} size="lg" className={cn(size, large && 'text-2xl')} />
  return (
    <span className={cn(size, 'inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground')} aria-hidden>
      <User className={large ? 'h-7 w-7' : 'h-4 w-4'} />
    </span>
  )
}

function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useProfile()
  const [name, setName] = useState(profile.name)
  const [avatar, setAvatar] = useState(profile.avatar)
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName(profile.name)
    setAvatar(profile.avatar)
    setError(null)
    // chi nap lai ban nhap luc mo hop thoai
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const dirty = name.trim() !== profile.name || avatar !== profile.avatar

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    if (!AVATAR_TYPES.includes(file.type)) return setError('Chỉ nhận ảnh PNG, JPG, WebP hoặc GIF.')
    if (file.size > AVATAR_MAX_BYTES) return setError('Ảnh quá lớn (tối đa 10MB).')
    setReading(true)
    try {
      setAvatar(await imageToAvatar(file))
      setError(null)
    } catch {
      setError('Không đọc được ảnh này.')
    } finally {
      setReading(false)
    }
  }

  const submit = () => {
    try {
      saveProfile({ name, avatar })
      onClose()
    } catch {
      setError('Không lưu được: bộ nhớ trình duyệt đã đầy.')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-sm" dirty={dirty}>
      <h2 className="pr-8 text-lg font-semibold">Hồ sơ</h2>
      <p className="mt-1 text-sm text-muted-foreground">Hiện ở thanh bên. Chỉ lưu trên trình duyệt này.</p>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-4">
            <ProfileAvatar profile={{ name, avatar }} large />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={reading}>
                {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                {avatar ? 'Đổi ảnh' : 'Chọn ảnh'}
              </Button>
              {avatar && (
                <Button size="sm" variant="ghost" onClick={() => setAvatar(null)}>
                  Bỏ ảnh
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={AVATAR_TYPES.join(',')}
                className="hidden"
                onChange={(e) => {
                  void pickFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>
          </div>

          <Field label="Tên hiển thị" error={error}>
            {(fp) => (
              <Input
                {...fp}
                data-autofocus
                autoComplete="off"
                maxLength={PROFILE_NAME_MAX}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tên của bạn"
              />
            )}
          </Field>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" disabled={reading}>
            Lưu
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Avatar + ten o cuoi thanh ben; bam de sua. compact = sidebar thu gon, chi con avatar. */
export function SidebarProfile({ compact }: { compact?: boolean }) {
  const profile = useProfile()
  const [open, setOpen] = useState(false)
  const label = profile.name || 'Đặt tên của bạn'
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label} · sửa hồ sơ`}
        title={compact ? label : 'Sửa tên và ảnh đại diện'}
        className={cn('flex min-w-0 items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-accent', !compact && 'flex-1')}
      >
        <ProfileAvatar profile={profile} />
        {!compact && (
          <span className={cn('truncate text-sm', profile.name ? 'font-medium' : 'text-muted-foreground')}>{label}</span>
        )}
      </button>
      <ProfileDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
