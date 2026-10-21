import { ImagePlus } from 'lucide-react'
import { marked } from 'marked'
import { useRef, useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { uploadMailImage } from '@/features/admin-mail/api'
import { handleServerError } from '@/lib/handle-server-error'

import { resolvePopupFormat } from '../lib/content'
import { popupImageLimit, popupImageMarkup } from '../lib/mail-content'
import type { PopupFormValues } from '../lib/schema'

export function PopupImageUpload({
  onBusyChange,
}: {
  onBusyChange?: (busy: boolean) => void
}) {
  const form = useFormContext<PopupFormValues>()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const upload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('图片不能超过 5 MiB')
      return
    }
    if (!['image/png', 'image/jpeg', 'image/gif'].includes(file.type)) {
      toast.error('请选择 PNG、JPEG 或 GIF 图片')
      return
    }
    const document = new DOMParser().parseFromString(
      form.getValues('content'),
      'text/html'
    )
    if (
      document.querySelectorAll('img,[data-mail-image]').length >=
      popupImageLimit
    ) {
      toast.error('每个弹窗最多插入 4 张图片')
      return
    }
    setBusy(true)
    onBusyChange?.(true)
    try {
      const image = await uploadMailImage(file)
      const markup = popupImageMarkup(image.name)
      let content = form.getValues('content')
      const format = resolvePopupFormat(content, form.getValues('format'))
      if (format === 'text') {
        const paragraph = window.document.createElement('p')
        paragraph.textContent = content
        content = paragraph.outerHTML.replace(/\n/g, '<br>')
      } else if (format === 'markdown')
        content = marked.parse(content, { async: false })
      const parsed = new DOMParser().parseFromString(content, 'text/html')
      const template = parsed.querySelector('div[data-mail-template]')
      if (template) {
        template.insertAdjacentHTML('beforeend', markup)
        content = parsed.body.innerHTML
      } else content = `${content}\n${markup}\n`
      form.setValue('format', 'html', { shouldDirty: true })
      form.setValue('content', content, {
        shouldDirty: true,
        shouldValidate: true,
      })
      toast.success('图片已插入，可在右侧实时预览')
    } catch (error) {
      handleServerError(error)
    } finally {
      setBusy(false)
      onBusyChange?.(false)
      if (input.current) input.current.value = ''
    }
  }
  return (
    <div className='space-y-2 rounded-lg border p-3'>
      <input
        ref={input}
        type='file'
        accept='image/png,image/jpeg,image/gif'
        aria-label='选择弹窗图片'
        className='sr-only'
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void upload(file)
        }}
      />
      <Button
        type='button'
        variant='outline'
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <ImagePlus />
        {busy ? '正在上传图片…' : '上传图片并插入正文'}
      </Button>
      <p className='text-muted-foreground text-xs'>
        支持 PNG、JPEG、GIF，每张最多 5 MiB，每个弹窗最多 4
        张。插入图片会保留原文，并切换为 HTML 格式。
      </p>
    </div>
  )
}
