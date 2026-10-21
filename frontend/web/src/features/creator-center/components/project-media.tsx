import { Download, ImagePlus, Paperclip, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useProductImageUpload } from '@/features/shop-preview/hooks/use-product-image-upload'

import { storeFile } from '../lib/files'
import type { Work } from '../types'

export function ProjectMedia(props: {
  images: string[]
  cover: string
  attachment: Work['attachment']
  onImages: (images: string[], cover: string) => void
  onAttachment: (attachment: Work['attachment']) => void
  onBusy: (busy: boolean) => void
}) {
  const { t } = useTranslation()
  const [fileBusy, setFileBusy] = useState(false)
  const [fileError, setFileError] = useState('')
  const [imageError, setImageError] = useState('')
  const upload = useProductImageUpload({
    remaining: 6 - props.images.length,
    disabled: fileBusy,
    // The server allows 400,000 characters per data URL, including its header.
    maxImageBytes:
      Math.floor((400000 - 'data:image/jpeg;base64,'.length) / 4) * 3,
    onBusyChange: props.onBusy,
    onUploaded: (urls) =>
      props.onImages([...props.images, ...urls], props.cover || urls[0]),
  })
  async function attach(file: File) {
    if (!file.size || file.size > 20 * 1024 * 1024) {
      setFileError(t('Choose a non-empty file under 20 MB'))
      return
    }
    setFileBusy(true)
    props.onBusy(true)
    setFileError('')
    try {
      const id = await storeFile(file)
      props.onAttachment({ id, name: file.name, size: file.size })
    } catch {
      setFileError(t('Unable to upload. Check file type and storage space.'))
    } finally {
      setFileBusy(false)
      props.onBusy(false)
    }
  }
  return (
    <>
      <section className='cc-editor-block'>
        <div className='cc-block-heading'>
          <ImagePlus aria-hidden />
          <h2>{t('Show your work')}</h2>
          <span>{t('Images')}</span>
        </div>
        <p>
          {t(
            'Add a cover and a few screenshots. The first image becomes the cover; you can change it below.'
          )}
        </p>
        <Label htmlFor='creator-images' className='sr-only'>
          {t('Choose project images')}
        </Label>
        <div className='cc-upload-zone'>
          <ImagePlus aria-hidden />
          <strong>
            {t('A good cover tells the first part of the story.')}
          </strong>
          <span>{t('PNG, JPEG or WebP · Up to 5 MB each · 6 images')}</span>
          <Input
            id='creator-images'
            type='file'
            accept='image/png,image/jpeg,image/webp'
            multiple
            disabled={upload.busy || fileBusy || props.images.length >= 6}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])]
              setImageError('')
              if (files.length > 6 - props.images.length) {
                setImageError(t('Up to 6 images per project'))
              } else void upload.addImages(files)
              event.target.value = ''
            }}
          />
        </div>
        {upload.busy && <p role='status'>{t('Preparing images…')}</p>}
        {(imageError || upload.error) && (
          <p role='alert' className='text-destructive'>
            {imageError || upload.error}
          </p>
        )}
        {props.images.length > 0 && (
          <div className='cc-media-thumbnails'>
            {props.images.map((url, index) => (
              <div key={url}>
                <Button
                  type='button'
                  variant='outline'
                  className='cc-media-image'
                  aria-label={t('Use image {{number}} as cover', {
                    number: index + 1,
                  })}
                  aria-pressed={props.cover === url}
                  disabled={upload.busy || fileBusy}
                  onClick={() => props.onImages(props.images, url)}
                >
                  <img
                    src={url}
                    alt={t('Project image {{number}}', { number: index + 1 })}
                  />
                </Button>
                <span>
                  {props.cover === url
                    ? t('Cover')
                    : t('Image {{number}}', { number: index + 1 })}
                </span>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-xs'
                  aria-label={t('Remove image {{number}}', {
                    number: index + 1,
                  })}
                  disabled={upload.busy || fileBusy}
                  onClick={() => {
                    const images = props.images.filter((image) => image !== url)
                    props.onImages(
                      images,
                      props.cover === url ? (images[0] ?? '') : props.cover
                    )
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className='cc-editor-block'>
        <div className='cc-block-heading'>
          <Paperclip aria-hidden />
          <h2>{t('Add an attachment')}</h2>
          <span>{t('Optional')}</span>
        </div>
        <p>
          {t(
            'Upload a resource package, PDF or workflow file. Files are private until the attached work is approved. Up to 20 MB per file and 100 MB per creator.'
          )}
        </p>
        <Label className='sr-only' htmlFor='creator-attachment'>
          {t('Choose project attachment')}
        </Label>
        <Input
          id='creator-attachment'
          type='file'
          disabled={fileBusy || upload.busy}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void attach(file)
            event.target.value = ''
          }}
        />
        {fileBusy && <p role='status'>{t('Preparing attachment…')}</p>}
        {fileError && (
          <p role='alert' className='text-destructive'>
            {fileError}
          </p>
        )}
        {props.attachment && (
          <div className='cc-file-row'>
            <Download aria-hidden />
            <span>
              {props.attachment.name}
              <small>{t('Stored on this device only')}</small>
            </span>
            <Button
              variant='ghost'
              size='icon-sm'
              type='button'
              aria-label={t('Remove attachment')}
              onClick={() => props.onAttachment(undefined)}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        )}
      </section>
    </>
  )
}
