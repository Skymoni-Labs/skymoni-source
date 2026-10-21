import { ImagePlus } from 'lucide-react'
import { marked } from 'marked'
import { useRef, useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { handleServerError } from '@/lib/handle-server-error'

import { uploadMailImage } from '../api'
import type { MailFormValues } from '../lib/schema'

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ] ?? char
  )

export function MailImageUpload({
  onEdit,
  onBusyChange,
}: {
  onEdit: () => void
  onBusyChange?: (busy: boolean) => void
}) {
  const form = useFormContext<MailFormValues>()
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
    if (
      (form.getValues('content').match(/data-mail-image=/g) ?? []).length >= 4
    ) {
      toast.error('每封邮件最多插入 4 张图片')
      return
    }
    setBusy(true)
    onBusyChange?.(true)
    try {
      const image = await uploadMailImage(file)
      let content = form.getValues('content')
      const format = form.getValues('format')
      if (format === 'text' && content)
        content = `<p>${escape(content).replace(/\n/g, '<br>')}</p>`
      if (format === 'markdown')
        content = marked.parse(content, { async: false })
      const document = new DOMParser().parseFromString(content, 'text/html')
      const template = document.querySelector('div[data-mail-template]')
      if (template) {
        template.insertAdjacentHTML('beforeend', image.html)
        content = document.body.innerHTML
      } else {
        content = `${content}\n${image.html}\n`
      }
      form.setValue('format', 'html', { shouldDirty: true })
      form.setValue('content', content, {
        shouldDirty: true,
        shouldValidate: true,
      })
      onEdit()
      toast.success('图片已上传并插入正文，可点击预览查看')
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
        aria-label='选择邮件图片'
        className='sr-only'
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0]
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
        PNG、JPEG、GIF，每张最多 5 MiB，每封最多 4 张。插入后自动使用 HTML
        格式并保留原有文字。
      </p>
    </div>
  )
}
