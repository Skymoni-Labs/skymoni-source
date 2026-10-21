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
import { ImagePlus } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { RichContent } from '@/components/rich-content'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useProductImageUpload } from '@/features/shop-preview/hooks/use-product-image-upload'
import { PRODUCT_IMAGE_TYPES } from '@/features/shop-preview/lib/images'

export function InstructionEditor(props: {
  id: string
  label: string
  value: string
  format: 'markdown' | 'html'
  disabled?: boolean
  onChange: (value: string) => void
  onBusyChange: (busy: boolean) => void
  onUpload?: (file: File, signal: AbortSignal) => Promise<string>
}) {
  const { t } = useTranslation()
  const textarea = useRef<HTMLTextAreaElement>(null)
  const selection = useRef<{ start: number; end: number } | null>(null)
  const [insertError, setInsertError] = useState('')
  const { busy, error, addImages } = useProductImageUpload({
    remaining: 1,
    disabled: props.disabled,
    onBusyChange: props.onBusyChange,
    onUpload: props.onUpload,
    onUploaded: (urls) => {
      const url = urls[0]
      if (!url) return
      const alt = t('Instruction image')
      const image =
        props.format === 'html'
          ? `<img src="${url}" alt="${alt}">`
          : `![${alt}](${url})`
      const { start, end } = selection.current ?? {
        start: props.value.length,
        end: props.value.length,
      }
      const insertion = `\n\n${image}\n`
      const next =
        props.value.slice(0, start) + insertion + props.value.slice(end)
      if (next.length > 12000) {
        setInsertError(
          t(
            'Instructions are too long. Shorten the text before inserting an image.'
          )
        )
        return
      }
      props.onChange(next)
      requestAnimationFrame(() => {
        textarea.current?.focus()
        textarea.current?.setSelectionRange(
          start + insertion.length,
          start + insertion.length
        )
      })
    },
  })
  function upload(files: File[]) {
    if (!files.length) return
    setInsertError('')
    void addImages(files.slice(0, 1))
  }
  return (
    <div className='min-w-0 space-y-3'>
      <Label htmlFor={props.id}>{props.label}</Label>
      <Textarea
        ref={textarea}
        id={props.id}
        rows={7}
        value={props.value}
        disabled={busy || props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        onSelect={(event) => {
          selection.current = {
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          }
        }}
        onPaste={(event) => {
          const files = [...event.clipboardData.files]
          if (!files.length) return
          event.preventDefault()
          selection.current = {
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          }
          upload(files)
        }}
      />
      <div className='space-y-2 rounded-lg border border-dashed p-3'>
        <Label
          htmlFor={`${props.id}-image`}
          className='flex items-center gap-2'
        >
          <ImagePlus className='size-4 text-sky-600' aria-hidden />
          {t('Upload instruction image')}
        </Label>
        <Input
          id={`${props.id}-image`}
          type='file'
          accept={PRODUCT_IMAGE_TYPES.join(',')}
          disabled={busy || props.disabled}
          onChange={(event) => {
            upload([...(event.target.files || [])])
            event.target.value = ''
          }}
        />
        <p role='status' className='text-muted-foreground text-xs'>
          {busy
            ? t('Uploading images…')
            : t(
                'Upload a PNG, JPEG or WebP under 5 MB, or paste an image into the instructions. Images are compressed and inserted at the cursor.'
              )}
        </p>
        {(error || insertError) && (
          <p role='alert' className='text-destructive text-sm'>
            {insertError || error}
          </p>
        )}
      </div>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Saved instructions also appear for users who already received this resource. Account details and purchase terms stay unchanged.'
        )}
      </p>
      {props.value && (
        <div className='space-y-2 rounded-lg border p-3'>
          <p className='text-muted-foreground text-xs'>
            {t('Instruction preview')}
          </p>
          <RichContent
            content={props.value}
            mode={props.format}
            className='[&_img]:h-auto [&_img]:max-w-full'
          />
        </div>
      )}
    </div>
  )
}
