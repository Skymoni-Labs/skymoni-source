/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ImagePlus,
  Images,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { ImageDialog } from '@/features/usage-logs/components/dialogs/image-dialog'
import { cn } from '@/lib/utils'

import { useProductImageUpload } from '../hooks/use-product-image-upload'
import { MAX_PRODUCT_IMAGES, PRODUCT_IMAGE_TYPES } from '../lib/images'
import type { ShopProduct } from '../types'

export function ProductImages(props: {
  hideHeading?: boolean
  label?: string
  enabled?: boolean
  images?: string[]
  name: string
  showcase?: boolean
  imageLayout?: ShopProduct['imageLayout']
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string>()
  if (!props.enabled || !props.images?.length) return null
  let imageFrameClassName = 'bg-muted/40 hover:bg-muted/60 h-48'
  let imageClassName = 'h-full w-full object-contain'
  if (props.imageLayout === 'portrait') {
    imageFrameClassName = 'h-auto bg-muted/40 hover:bg-muted/60'
    imageClassName = 'block h-auto w-full'
  } else if (props.showcase) {
    imageFrameClassName =
      'aspect-video h-auto border-slate-200 bg-slate-900 hover:bg-slate-900 dark:border-slate-700'
    imageClassName = 'h-full w-full object-cover'
  } else if (props.images.length === 1) {
    imageFrameClassName += ' sm:h-64'
  }
  return (
    <section className='min-w-0 space-y-3'>
      {!props.showcase && !props.hideHeading && (
        <h3 className='flex items-center gap-2 text-sm font-semibold'>
          <Images className='size-4 text-sky-600' aria-hidden />
          {props.label ?? t('Product screenshots')}
        </h3>
      )}
      <Carousel
        opts={{ align: 'start', dragFree: true }}
        aria-label={props.label ?? t('Product screenshots')}
      >
        {props.images.length > 1 && (
          <div className='mb-3 flex justify-end gap-2'>
            <CarouselPrevious
              className='static translate-y-0'
              aria-label={t('Previous image')}
            />
            <CarouselNext
              className='static translate-y-0'
              aria-label={t('Next image')}
            />
          </div>
        )}
        <CarouselContent>
          {props.images.map((url, index) => (
            <CarouselItem
              key={url}
              className={
                props.images?.length === 1
                  ? 'basis-full'
                  : 'basis-[80%] sm:basis-[48%]'
              }
            >
              <Button
                type='button'
                variant='ghost'
                className={cn(
                  'w-full overflow-hidden rounded-md border p-0',
                  imageFrameClassName
                )}
                aria-label={t('View image {{number}}', { number: index + 1 })}
                onClick={() => setSelected(url)}
              >
                <img
                  src={url}
                  alt={t('{{name}} screenshot {{number}}', {
                    name: props.name,
                    number: index + 1,
                  })}
                  loading='lazy'
                  className={imageClassName}
                />
              </Button>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      {selected && (
        <ImageDialog
          key={selected}
          imageUrl={selected}
          open
          onOpenChange={(open) => {
            if (!open) setSelected(undefined)
          }}
          description={props.name}
          imageAlt={props.name}
          showUrl={false}
        />
      )}
    </section>
  )
}

function ProductImageUpload(props: {
  label?: string
  cover?: boolean
  remaining: number
  disabled?: boolean
  onBusyChange: (busy: boolean) => void
  onUploaded: (images: string[]) => void
  onUpload?: (file: File, signal: AbortSignal) => Promise<string>
  children?: React.ReactNode
}) {
  const { t } = useTranslation()
  const { busy, error, addImages } = useProductImageUpload(props)
  const id = props.cover ? 'shop-cover-file' : 'shop-image-files'
  return (
    <div
      className='focus-visible:outline-ring space-y-3 rounded-lg border border-dashed p-3 focus-visible:outline-2'
      role='group'
      tabIndex={0}
      aria-label={t(
        props.cover ? 'Paste a cover image here' : 'Paste product images here'
      )}
      onPaste={(event) => {
        const files = [...event.clipboardData.files]
        if (files.length) {
          event.preventDefault()
          void addImages(files)
        }
      }}
    >
      <p className='text-sm'>
        {t(
          'Focus this area and press Ctrl+V to paste copied images, or choose files below.'
        )}
      </p>
      <Label htmlFor={id} className='sr-only'>
        {props.label ??
          t(props.cover ? 'Choose cover image' : 'Choose product images')}
      </Label>
      <Input
        id={id}
        type='file'
        multiple={!props.cover}
        accept={PRODUCT_IMAGE_TYPES.join(',')}
        disabled={busy || props.disabled || props.remaining === 0}
        onChange={(event) => {
          void addImages([...(event.target.files || [])])
          event.target.value = ''
        }}
      />
      <p className='text-muted-foreground text-xs' role='status'>
        {busy
          ? t('Uploading images…')
          : t(
              'PNG, JPEG or WebP, up to 5 MB each and 12 images. Images are automatically compressed.'
            )}
      </p>
      {error && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
      {props.children}
    </div>
  )
}

export function ProductCoverEditor(props: {
  coverUrl: string
  images: string[]
  disabled?: boolean
  onChange: (url: string) => void
  onImagesChange: (images: string[]) => void
  onBusyChange: (busy: boolean) => void
  onUpload?: (file: File, signal: AbortSignal) => Promise<string>
}) {
  const { t } = useTranslation()
  return (
    <section className='space-y-3 rounded-xl border p-4'>
      <h3 className='flex items-center gap-2 text-sm font-medium'>
        <ImagePlus className='size-4 text-sky-600' aria-hidden />
        {t('Product cover')}
      </h3>
      <div className='grid items-start gap-4 sm:grid-cols-[140px_minmax(0,1fr)]'>
        <div className='bg-muted/30 flex aspect-video items-center justify-center overflow-hidden rounded-lg border'>
          {props.coverUrl ? (
            <img
              src={props.coverUrl}
              alt={t('Cover preview')}
              className='h-full w-full object-cover'
            />
          ) : (
            <ImagePlus className='text-muted-foreground size-7' aria-hidden />
          )}
        </div>
        <ProductImageUpload
          cover
          remaining={Math.min(1, MAX_PRODUCT_IMAGES - props.images.length)}
          disabled={props.disabled}
          onBusyChange={props.onBusyChange}
          onUpload={props.onUpload}
          onUploaded={(urls) => {
            const url = urls[0]
            if (!url) return
            props.onImagesChange([...new Set([...props.images, url])])
            props.onChange(url)
          }}
        />
      </div>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Uploaded covers are shared with product images. Select an existing image below or set it as the cover in Display content.'
        )}
      </p>
      {props.images.length > 0 && (
        <div
          className='flex flex-wrap gap-2'
          aria-label={t('Choose cover from product images')}
        >
          {props.images.map((url, index) => (
            <Button
              key={url}
              type='button'
              variant='outline'
              className='relative h-14 w-20 overflow-hidden p-0'
              disabled={props.disabled}
              aria-label={t('Use image {{number}} as cover', {
                number: index + 1,
              })}
              aria-pressed={props.coverUrl === url}
              onClick={() => props.onChange(url)}
            >
              <img src={url} alt='' className='h-full w-full object-cover' />
              {props.coverUrl === url && (
                <span className='absolute right-1 bottom-1 rounded-full bg-sky-600 p-0.5 text-white'>
                  <Check className='size-3' aria-hidden />
                </span>
              )}
            </Button>
          ))}
        </div>
      )}
      <div className='flex items-end gap-2'>
        <div className='min-w-0 flex-1 space-y-2'>
          <Label htmlFor='shop-cover'>{t('Cover image URL')}</Label>
          <Input
            id='shop-cover'
            value={props.coverUrl}
            onChange={(event) => props.onChange(event.target.value)}
            disabled={props.disabled}
            placeholder='https://…'
          />
        </div>
        <Button
          type='button'
          variant='outline'
          disabled={props.disabled || !props.coverUrl}
          onClick={() => props.onChange('')}
        >
          {t('Remove cover')}
        </Button>
      </div>
    </section>
  )
}

export function ProductImagesEditor(props: {
  label?: string
  uploadLabel?: string
  enabled: boolean
  images: string[]
  imageLayout: NonNullable<ShopProduct['imageLayout']>
  onLayoutChange: (value: NonNullable<ShopProduct['imageLayout']>) => void
  name: string
  coverUrl?: string
  disabled?: boolean
  onCoverChange?: (url: string) => void
  onEnabledChange: (value: boolean) => void
  onChange: (images: string[]) => void
  onBusyChange: (busy: boolean) => void
  onUpload?: (file: File, signal: AbortSignal) => Promise<string>
}) {
  const { t } = useTranslation()
  return (
    <section className='space-y-3 rounded-xl border p-4'>
      <div className='flex items-center justify-between gap-3'>
        <Label
          htmlFor='shop-images-enabled'
          className='flex items-center gap-2'
        >
          <Images className='size-4 text-sky-600' aria-hidden />
          {props.label ?? t('Show product images')}
        </Label>
        <Switch
          id='shop-images-enabled'
          checked={props.enabled}
          disabled={props.disabled}
          onCheckedChange={props.onEnabledChange}
        />
      </div>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Choose portrait or landscape display. Turning this off keeps your uploaded images.'
        )}
      </p>
      {props.enabled && (
        <div className='space-y-3'>
          <div className='space-y-2'>
            <Label htmlFor='shop-image-layout'>{t('Image display mode')}</Label>
            <NativeSelect
              id='shop-image-layout'
              className='w-full'
              value={props.imageLayout}
              disabled={props.disabled}
              onChange={(event) => {
                const value = event.target.value
                if (value === 'portrait' || value === 'landscape') {
                  props.onLayoutChange(value)
                }
              }}
            >
              <option value='portrait'>
                {t('Portrait · fill width at original ratio')}
              </option>
              <option value='landscape'>
                {t('Landscape · original display')}
              </option>
            </NativeSelect>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Portrait fills the image area width with automatic height, without stretching or cropping. Landscape keeps the original frame.'
              )}
            </p>
          </div>
          <ProductImageUpload
            label={props.uploadLabel}
            remaining={MAX_PRODUCT_IMAGES - props.images.length}
            disabled={props.disabled}
            onBusyChange={props.onBusyChange}
            onUpload={props.onUpload}
            onUploaded={(urls) =>
              props.onChange([...new Set([...props.images, ...urls])])
            }
          >
            <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
              {props.images.map((url, index) => (
                <div key={url} className='min-w-0 rounded-lg border p-2'>
                  <img
                    src={url}
                    alt={t('Product image {{number}}', { number: index + 1 })}
                    className='h-24 w-full object-contain'
                  />
                  {props.onCoverChange && (
                    <Button
                      type='button'
                      size='sm'
                      variant={props.coverUrl === url ? 'secondary' : 'outline'}
                      className='mt-2 w-full text-xs'
                      disabled={props.disabled}
                      aria-label={t('Set image {{number}} as cover', {
                        number: index + 1,
                      })}
                      aria-pressed={props.coverUrl === url}
                      onClick={() => props.onCoverChange?.(url)}
                    >
                      {props.coverUrl === url ? (
                        <>
                          <Check className='size-3' aria-hidden />
                          {t('Current cover')}
                        </>
                      ) : (
                        t('Set as cover')
                      )}
                    </Button>
                  )}
                  <div className='mt-2 flex justify-center gap-1'>
                    <Button
                      type='button'
                      size='icon-sm'
                      variant='ghost'
                      disabled={props.disabled || index === 0}
                      aria-label={t('Move image {{number}} earlier', {
                        number: index + 1,
                      })}
                      onClick={() => {
                        const images = [...props.images]
                        ;[images[index - 1], images[index]] = [
                          images[index],
                          images[index - 1],
                        ]
                        props.onChange(images)
                      }}
                    >
                      <ArrowLeft />
                    </Button>
                    <Button
                      type='button'
                      size='icon-sm'
                      variant='ghost'
                      disabled={
                        props.disabled || index === props.images.length - 1
                      }
                      aria-label={t('Move image {{number}} later', {
                        number: index + 1,
                      })}
                      onClick={() => {
                        const images = [...props.images]
                        ;[images[index + 1], images[index]] = [
                          images[index],
                          images[index + 1],
                        ]
                        props.onChange(images)
                      }}
                    >
                      <ArrowRight />
                    </Button>
                    <Button
                      type='button'
                      size='icon-sm'
                      variant='ghost'
                      disabled={props.disabled}
                      aria-label={t('Remove image {{number}}', {
                        number: index + 1,
                      })}
                      onClick={() =>
                        props.onChange(
                          props.images.filter((_, i) => i !== index)
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ProductImageUpload>
          <ProductImages
            label={props.label}
            enabled
            images={props.images}
            name={props.name}
            imageLayout={props.imageLayout}
          />
        </div>
      )}
    </section>
  )
}
