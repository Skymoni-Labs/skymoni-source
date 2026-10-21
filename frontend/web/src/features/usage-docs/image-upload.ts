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
import { toast } from 'sonner'

import { uploadDocImage, validateDocImageFile } from './api'
import { safeImageURL, type DocBlock, type DocPage } from './types'

// Upload results merge into the current draft, never the draft captured when
// a slow request began. Leaving the editor cancels the request and late updates.
export function useDocImageUpload(
  page: DocPage,
  onChange: (page: DocPage) => void,
  onUploadingChange?: (uploading: boolean) => void
) {
  const [uploading, setUploading] = useState('')
  const latest = useRef({ page, onChange, onUploadingChange })
  const active = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    latest.current = { page, onChange, onUploadingChange }
  }, [page, onChange, onUploadingChange])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      active.current?.abort()
    }
  }, [])

  async function uploadFiles(
    files: File[],
    afterID?: string,
    replaceID?: string
  ) {
    if (!files.length || active.current) return
    try {
      files.forEach(validateDocImageFile)
      if (replaceID && files.length !== 1) {
        throw new Error('替换图片时请只选择一张')
      }
      if (
        !replaceID &&
        latest.current.page.blocks.length + files.length > 200
      ) {
        throw new Error('内容块最多 200 个，请减少图片数量或移除多余内容块')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '图片格式不正确')
      return
    }
    const controller = new AbortController()
    active.current = controller
    latest.current.onUploadingChange?.(true)
    setUploading(`正在上传 1 / ${files.length}`)
    let anchor = afterID
    let inserted = 0
    try {
      for (let i = 0; i < files.length; i++) {
        setUploading(`正在上传 ${i + 1} / ${files.length}`)
        const { url } = await uploadDocImage(files[i], controller.signal)
        if (!mounted.current || controller.signal.aborted) return
        if (!safeImageURL(url)) throw new Error('上传结果无效，请重试')
        const current = latest.current.page
        let blocks: DocBlock[]
        if (replaceID) {
          if (
            !current.blocks.some(
              (b) => b.id === replaceID && b.type === 'image'
            )
          ) {
            return
          }
          blocks = current.blocks.map((b) =>
            b.id === replaceID ? { ...b, url } : b
          )
        } else {
          if (current.blocks.length >= 200) {
            throw new Error('内容块已满，请移除多余内容后重试')
          }
          const block: DocBlock = {
            id: crypto.randomUUID(),
            type: 'image',
            text: '',
            url,
            level: 0,
          }
          const index = current.blocks.findIndex((b) => b.id === anchor)
          blocks = [...current.blocks]
          blocks.splice(index < 0 ? blocks.length : index + 1, 0, block)
          anchor = block.id
        }
        const next = { ...current, blocks }
        latest.current.page = next
        latest.current.onChange(next)
        inserted++
      }
      toast.success(
        replaceID
          ? '图片已替换，保存或发布后生效'
          : `已插入 ${inserted} 张图片，保存或发布后生效`
      )
      const insertedID = anchor
      if (!replaceID && insertedID) {
        requestAnimationFrame(() => {
          if (mounted.current) {
            document
              .querySelector<HTMLInputElement>(`[id="edit-${insertedID}"]`)
              ?.focus()
          }
        })
      }
    } catch (error) {
      if (!controller.signal.aborted && mounted.current) {
        toast.error(
          error instanceof Error ? error.message : '图片上传失败，请重试'
        )
      }
    } finally {
      active.current = null
      if (mounted.current) {
        setUploading('')
        latest.current.onUploadingChange?.(false)
      }
    }
  }
  return { uploading, uploadFiles }
}
