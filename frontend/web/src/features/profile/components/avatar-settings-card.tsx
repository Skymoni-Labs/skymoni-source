import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UserAvatar } from '@/components/user-avatar'
import { handleServerError } from '@/lib/handle-server-error'
import { prepareAvatar } from '@/lib/prepare-avatar'
import { saveAccountIdentity } from '@/lib/site-identity'

import type { UserProfile } from '../types'

export function AvatarSettingsCard(props: {
  profile: UserProfile | null
  onProfileUpdate: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function selectFile(file?: File) {
    if (!file) return
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      toast.error(t('Choose a PNG, JPEG or WebP image under 5 MB'))
      return
    }
    setBusy(true)
    try {
      setPreview(await prepareAvatar(file))
    } catch (error) {
      handleServerError(error)
    } finally {
      setBusy(false)
    }
  }
  async function save(value: string) {
    setBusy(true)
    try {
      await saveAccountIdentity({ avatar: value })
      await props.onProfileUpdate()
      setPreview(null)
      toast.success(t('Avatar updated'))
    } catch (error) {
      handleServerError(error)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Profile picture')}</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-wrap items-center gap-5'>
        <UserAvatar
          className='size-20'
          name={props.profile?.username}
          setting={
            preview === null ? props.profile?.setting : { avatar: preview }
          }
        />
        <div className='min-w-0 flex-1 space-y-3'>
          <Label htmlFor='avatar-file'>{t('Choose your picture')}</Label>
          <Input
            id='avatar-file'
            type='file'
            accept='image/png,image/jpeg,image/webp'
            disabled={busy}
            onChange={(event) => {
              void selectFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'PNG, JPEG or WebP, up to 5 MB. The center is cropped into a circle.'
            )}
          </p>
          <div className='flex flex-wrap gap-2'>
            <Button
              disabled={busy || preview === null}
              onClick={() => void save(preview || '')}
            >
              {t('Save picture')}
            </Button>
            <Button
              variant='outline'
              disabled={busy}
              onClick={() => void save('')}
            >
              {t('Restore default picture')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
