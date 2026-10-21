import { zodResolver } from '@hookform/resolvers/zod'
import { Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { uploadProductImage } from '@/features/shop/api'
import { handleServerError } from '@/lib/handle-server-error'

import { uploadSoftwareFile } from './api'
import { SoftwareDetailsFields } from './details-fields'
import { SoftwareDownloadFields } from './download-fields'
import { safeLink, softwareEntrySchema } from './lib/schema'
import type { SoftwareEntry } from './types'

const installerAccept =
  '.exe,.msi,.apk,.dmg,.pkg,.zip,.7z,.tar.gz,.deb,.rpm,.AppImage'
export function SoftwareEditor(props: {
  entry: SoftwareEntry
  onClose: () => void
  onSave: (entry: SoftwareEntry) => Promise<void>
  onUploaded: () => void
}) {
  const { t } = useTranslation()
  const form = useForm<SoftwareEntry>({
    resolver: zodResolver(softwareEntrySchema),
    defaultValues: props.entry,
  })
  const downloadUrl = useWatch({ control: form.control, name: 'downloadUrl' })
  let copyUrl = ''
  try {
    if (safeLink.safeParse(downloadUrl).success && downloadUrl) {
      copyUrl = new URL(downloadUrl, window.location.origin).href
    }
  } catch {
    /* The field displays validation errors. */
  }
  const [busy, setBusy] = useState<'installer' | 'image' | null>(null)
  const [screenshotsBusy, setScreenshotsBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const upload = useRef<AbortController | null>(null)
  const busyRef = useRef(false)
  useEffect(() => () => upload.current?.abort(), [])
  const textFields = [
    ['name', 'Software or tool name'],
    ['description', 'Description'],
    ['platform', 'Supported platforms'],
    ['version', 'Version'],
    ['detailUrl', 'Website or details link'],
    ['imageUrl', 'Cover or icon URL'],
  ] as const
  const addFile = async (file: File, image: boolean) => {
    if (busyRef.current) return
    if (
      file.size === 0 ||
      file.size > (image ? 5 * 1024 * 1024 : 1024 * 1024 * 1024)
    ) {
      setUploadError(
        t(
          image
            ? 'Choose a PNG, JPEG or WebP image under 5 MB'
            : 'Choose an installer under 1 GB'
        )
      )
      return
    }
    if (
      !image &&
      !/\.(exe|msi|apk|dmg|pkg|zip|7z|tar\.gz|deb|rpm|appimage)$/i.test(
        file.name
      )
    ) {
      setUploadError(t('Unsupported installer format'))
      return
    }
    busyRef.current = true
    const controller = new AbortController()
    upload.current = controller
    setBusy(image ? 'image' : 'installer')
    setProgress(0)
    setUploadError('')
    try {
      if (image) {
        const url = await uploadProductImage(file, controller.signal)
        if (!controller.signal.aborted) {
          form.setValue('imageUrl', url, {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
      } else {
        const result = await uploadSoftwareFile(
          file,
          controller.signal,
          setProgress
        )
        if (!controller.signal.aborted) {
          form.setValue('downloadUrl', result.url, {
            shouldDirty: true,
            shouldValidate: true,
          })
          form.setValue('filename', result.filename, { shouldDirty: true })
          props.onUploaded()
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setUploadError(t('Upload failed. Your previous link was kept.'))
        handleServerError(error)
      }
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }
  return (
    <Dialog
      open
      title={t('Edit software or tool')}
      description={t(
        'Upload an installer or enter a website link. Publish when it is ready.'
      )}
      onOpenChange={(open) => {
        if (!open && !form.formState.isSubmitting) {
          upload.current?.abort()
          props.onClose()
        }
      }}
      footer={
        <>
          <Button
            variant='outline'
            disabled={form.formState.isSubmitting}
            onClick={() => {
              upload.current?.abort()
              props.onClose()
            }}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='submit'
            form='software-editor'
            disabled={
              Boolean(busy) || screenshotsBusy || form.formState.isSubmitting
            }
          >
            {form.formState.isSubmitting ? t('Saving...') : t('Save Changes')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id='software-editor'
          className='space-y-5'
          onSubmit={form.handleSubmit(async (value) => {
            if (busy || screenshotsBusy) return
            try {
              await props.onSave(value)
            } catch (error) {
              handleServerError(error)
            }
          })}
        >
          <fieldset
            disabled={Boolean(busy) || form.formState.isSubmitting}
            className='space-y-5 disabled:opacity-70'
          >
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='kind'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Category')}</FormLabel>
                    <FormControl>
                      <NativeSelect className='w-full' {...field}>
                        <option value='software'>{t('Software')}</option>
                        <option value='tool'>{t('Tool')}</option>
                      </NativeSelect>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='sortOrder'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Sort order')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        {...field}
                        onChange={(event) =>
                          field.onChange(event.target.valueAsNumber)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {textFields.slice(0, 4).map(([name, label]) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t(label)}</FormLabel>
                    <FormControl>
                      {name === 'description' ? (
                        <Textarea rows={3} {...field} />
                      ) : (
                        <Input {...field} />
                      )}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <div className='bg-muted/30 space-y-3 rounded-xl border p-4'>
              <Label htmlFor='software-installer'>
                {t('Upload local installer')}
              </Label>
              <Input
                id='software-installer'
                type='file'
                accept={installerAccept}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void addFile(file, false)
                  event.target.value = ''
                }}
              />
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Up to 1 GB. EXE, MSI, APK, DMG, PKG, ZIP, 7Z, TAR.GZ, DEB, RPM or AppImage.'
                )}
              </p>
              <FormField
                control={form.control}
                name='downloadUrl'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Download link')}</FormLabel>
                    <div className='flex gap-2'>
                      <FormControl>
                        <Input {...field} placeholder='https://' />
                      </FormControl>
                      {copyUrl && (
                        <CopyButton
                          value={copyUrl}
                          aria-label={t('Copy download link')}
                        />
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Uploading fills in the download link automatically. Visitors can download after publishing.'
                )}
              </p>
            </div>
            {textFields.slice(4).map(([name, label]) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t(label)}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='https://' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <div className='space-y-2'>
              <Label htmlFor='software-cover'>
                {t('Upload cover or icon')}
              </Label>
              <Input
                id='software-cover'
                type='file'
                accept='image/png,image/jpeg,image/webp'
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void addFile(file, true)
                  event.target.value = ''
                }}
              />
              <p className='text-muted-foreground text-xs'>
                {t('Choose a PNG, JPEG or WebP image under 5 MB')}
              </p>
            </div>
            <SoftwareDownloadFields
              form={form}
              disabled={Boolean(busy) || form.formState.isSubmitting}
            />
            <SoftwareDetailsFields
              form={form}
              onBusyChange={setScreenshotsBusy}
              disabled={Boolean(busy) || form.formState.isSubmitting}
            />
            <FormField
              control={form.control}
              name='published'
              render={({ field }) => (
                <FormItem className='flex items-center justify-between rounded-xl border p-4'>
                  <div>
                    <FormLabel>{t('Published in Software Center')}</FormLabel>
                    <p className='text-muted-foreground mt-1 text-xs'>
                      {t(
                        'Off keeps this item as a draft. Visitors cannot see it.'
                      )}
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </fieldset>
          {busy && (
            <div role='status' className='space-y-2'>
              <p className='flex items-center gap-2 text-sm'>
                <Upload size={14} />
                {t('Uploading...')} {busy === 'installer' ? `${progress}%` : ''}
              </p>
              <Progress value={progress} aria-label={t('Upload progress')} />
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => upload.current?.abort()}
              >
                {t('Cancel upload')}
              </Button>
            </div>
          )}
          {uploadError && (
            <p role='alert' className='text-destructive text-sm'>
              {uploadError}
            </p>
          )}
        </form>
      </Form>
    </Dialog>
  )
}
