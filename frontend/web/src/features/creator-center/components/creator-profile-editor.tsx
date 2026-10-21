import { ImagePlus, RotateCcw, Save } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'
import { prepareAvatar } from '@/lib/prepare-avatar'

import { creatorProfileSchema, type CreatorProfile } from '../lib/hub'
import { CreatorAvatar } from './creator-avatar'

export function CreatorProfileEditor(props: {
  profile: CreatorProfile
  onSave: (profile: CreatorProfile) => Promise<void>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const formId = useId()
  const [draft, setDraft] = useState({ ...props.profile })
  const [error, setError] = useState('')
  const [imageError, setImageError] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [saving, setSaving] = useState(false)
  const busyRef = useRef(false)
  const active = useRef(true)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const busy = preparing || saving

  async function selectFile(file?: File) {
    if (!file || busyRef.current) return
    setImageError('')
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      !file.size ||
      file.size > 5 * 1024 * 1024
    ) {
      setImageError(t('Choose a PNG, JPEG or WebP image under 5 MB'))
      return
    }
    busyRef.current = true
    setPreparing(true)
    try {
      const avatar = await prepareAvatar(file)
      if (active.current) setDraft((current) => ({ ...current, avatar }))
    } catch {
      if (active.current) setImageError(t('Unable to read image'))
    } finally {
      busyRef.current = false
      if (active.current) setPreparing(false)
    }
  }

  async function persist() {
    if (busyRef.current) return
    setError('')
    const parsed = creatorProfileSchema.safeParse(draft)
    if (!parsed.success) {
      setError(
        t(
          'Enter a name, a handle using letters/numbers/-/_, and a full http or https website link if provided.'
        )
      )
      return
    }
    busyRef.current = true
    setSaving(true)
    try {
      await props.onSave(parsed.data)
      if (!active.current) return
      toast.success(t('Creator profile saved'))
      props.onClose()
    } catch (cause) {
      if (active.current) {
        handleServerError(cause)
        setError(
          t(
            'Unable to save. Please retry or refresh if the content has changed.'
          )
        )
      }
    } finally {
      busyRef.current = false
      if (active.current) setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busyRef.current) props.onClose()
      }}
      title={t('Edit creator profile')}
      description='名称和头像与中转站账号同步；简介、主页地址和创作介绍保留在这里。'
      contentClassName='ch-profile-dialog'
      showCloseButton={!busy}
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            disabled={busy}
            onClick={props.onClose}
          >
            {t('Cancel')}
          </Button>
          <Button
            className='cc-primary'
            type='submit'
            form={formId}
            disabled={busy}
          >
            <Save aria-hidden />
            {saving ? t('Saving...') : t('Save creator profile')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className='ch-profile-form'
        onSubmit={(event) => {
          event.preventDefault()
          void persist()
        }}
      >
        <fieldset disabled={busy} className='ch-profile-fields'>
          <section
            className='ch-profile-avatar-editor'
            aria-label={t('Profile picture')}
          >
            <CreatorAvatar avatar={draft.avatar} name={draft.name} />
            <div>
              <Label htmlFor='creator-avatar-file'>
                {t('Profile picture')}
              </Label>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'PNG, JPEG or WebP, up to 5 MB. The center is cropped into a circle.'
                )}
              </p>
              <Input
                ref={fileInput}
                id='creator-avatar-file'
                type='file'
                className='sr-only'
                accept='image/png,image/jpeg,image/webp'
                onChange={(event) => {
                  void selectFile(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
              <div className='ch-profile-avatar-actions'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => fileInput.current?.click()}
                >
                  <ImagePlus aria-hidden />
                  {t('Upload picture')}
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  disabled={!draft.avatar || busy}
                  onClick={() => {
                    setDraft((current) => ({ ...current, avatar: '' }))
                    setImageError('')
                  }}
                >
                  <RotateCcw aria-hidden />
                  {t('Restore default picture')}
                </Button>
              </div>
              {preparing && <p role='status'>{t('Preparing images…')}</p>}
              {imageError && (
                <p role='alert' className='ch-form-error'>
                  {imageError}
                </p>
              )}
            </div>
          </section>
          {[
            { key: 'name', label: 'Creator display name', max: 20 },
            { key: 'handle', label: 'Creator handle', max: 40 },
            { key: 'bio', label: 'Short biography', max: 180 },
            { key: 'website', label: 'Personal website', max: 2000 },
          ].map((field) => (
            <div key={field.key}>
              <Label htmlFor={`profile-${field.key}`}>{t(field.label)}</Label>
              <Input
                id={`profile-${field.key}`}
                maxLength={field.max}
                value={
                  draft[field.key as 'name' | 'handle' | 'bio' | 'website']
                }
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
              />
            </div>
          ))}
          <div>
            <Label htmlFor='profile-introduction'>
              {t('Profile introduction')}
            </Label>
            <Textarea
              id='profile-introduction'
              rows={5}
              maxLength={4000}
              value={draft.introduction}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  introduction: event.target.value,
                }))
              }
            />
          </div>
        </fieldset>
        {error && (
          <p role='alert' className='ch-form-error'>
            {error}
          </p>
        )}
      </form>
    </Dialog>
  )
}
