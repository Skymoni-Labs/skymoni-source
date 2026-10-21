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

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { handleServerError } from '@/lib/handle-server-error'

import { PRODUCT_IMAGE_TYPES, prepareProductImage } from '../lib/images'

export function useProductImageUpload(props: {
  remaining: number
  disabled?: boolean
  maxImageBytes?: number
  onBusyChange: (busy: boolean) => void
  onUploaded: (images: string[]) => void
  onUpload?: (file: File, signal: AbortSignal) => Promise<string>
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const busyRef = useRef(false)
  const upload = useRef<AbortController | null>(null)
  useEffect(() => () => upload.current?.abort(), [])

  async function addImages(files: File[]) {
    if (!files.length || busyRef.current || props.disabled) return
    setError('')
    if (files.length > props.remaining) {
      setError(t('Up to 12 images per product'))
      return
    }
    if (
      files.some(
        (file) =>
          !PRODUCT_IMAGE_TYPES.includes(file.type) ||
          file.size > 5 * 1024 * 1024
      )
    ) {
      setError(t('Choose a PNG, JPEG or WebP image under 5 MB'))
      return
    }
    busyRef.current = true
    setBusy(true)
    props.onBusyChange(true)
    const controller = new AbortController()
    upload.current = controller
    const images: string[] = []
    try {
      for (const file of files) {
        const prepared = await prepareProductImage(file, props.maxImageBytes)
        if (controller.signal.aborted) return
        let url: string
        if (props.onUpload) {
          url = await props.onUpload(prepared, controller.signal)
        } else {
          url = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.addEventListener(
              'load',
              () => resolve(String(reader.result)),
              { once: true }
            )
            reader.addEventListener(
              'error',
              () => reject(new Error(t('Unable to read image'))),
              { once: true }
            )
            reader.readAsDataURL(prepared)
          })
        }
        if (controller.signal.aborted) return
        if (!images.includes(url)) images.push(url)
        props.onUploaded([...images])
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(t('Image upload failed. Your existing images were kept.'))
        handleServerError(cause, t('Image upload failed'))
      }
    } finally {
      busyRef.current = false
      if (!controller.signal.aborted) {
        setBusy(false)
        props.onBusyChange(false)
      }
    }
  }

  return { busy, error, addImages }
}
