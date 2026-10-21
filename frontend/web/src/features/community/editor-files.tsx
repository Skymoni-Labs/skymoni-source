import { FileUp, ImagePlus, Paperclip, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { handleServerError } from '@/lib/handle-server-error'

import {
  actorKey,
  importTopicDocument,
  uploadTopicFile,
} from './editor-file-utils'
import type { TopicFormat, TopicUpload } from './types'

export function TopicEditorFiles(props: {
  content: string
  uploads: TopicUpload[]
  disabled?: boolean
  onImport: (document: { content: string; format: TopicFormat }) => void
  onUpload: (file: TopicUpload) => void
  onInsert?: (file: TopicUpload) => void
  onRemove: (file: TopicUpload) => void
  onBusy: (busy: boolean) => void
}) {
  const documentInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{
    content: string
    format: TopicFormat
    name: string
  } | null>(null)
  async function importFile(file?: File) {
    if (!file) return
    try {
      const document = await importTopicDocument(file)
      if (props.content.trim()) setPending({ ...document, name: file.name })
      else props.onImport(document)
    } catch (error) {
      handleServerError(error)
    }
  }
  async function upload(files: FileList | null) {
    if (!files?.length || busy) return
    if (props.uploads.length + files.length > 20) {
      toast.error('一个话题最多附带 20 个文件')
      return
    }
    const selectedFiles = [...files]
    const actor = actorKey()
    setBusy(true)
    props.onBusy(true)
    try {
      for (const file of selectedFiles) {
        if (actorKey() !== actor) {
          throw new DOMException('Account changed', 'AbortError')
        }
        props.onUpload(await uploadTopicFile(file))
      }
      toast.success('上传完成，可在附件列表再次插入正文')
    } catch (error) {
      handleServerError(error)
    } finally {
      setBusy(false)
      props.onBusy(false)
    }
  }
  return (
    <div className='sf-editor-files'>
      <div className='sf-editor-file-actions'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={busy || props.disabled}
          onClick={() => documentInput.current?.click()}
        >
          <FileUp />
          导入内容文件
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={busy || props.disabled}
          onClick={() => imageInput.current?.click()}
        >
          <ImagePlus />
          上传图片
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={busy || props.disabled}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip />
          上传附件
        </Button>
        {busy && <span role='status'>正在上传，请稍候…</span>}
      </div>
      <input
        ref={documentInput}
        type='file'
        hidden
        aria-label='选择导入内容文件'
        accept='.md,.markdown,.html,.htm,.txt,.text,.json,.csv,.yaml,.yml,.xml,.log'
        onChange={(event) => {
          void importFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      <input
        ref={imageInput}
        type='file'
        hidden
        multiple
        aria-label='选择上传图片'
        accept='image/png,image/jpeg,image/gif,image/webp'
        onChange={(event) => {
          const files = event.target.files
          void upload(files)
          event.target.value = ''
        }}
      />
      <input
        ref={fileInput}
        type='file'
        hidden
        multiple
        aria-label='选择上传附件'
        onChange={(event) => {
          const files = event.target.files
          void upload(files)
          event.target.value = ''
        }}
      />
      <p className='sf-editor-file-hint'>
        MD / HTML / TXT 等可导入正文；图片与附件支持批量上传，单个文件最多 5
        MB。先在正文中点击目标位置，上传后插入到光标处；已上传文件也可再次插入。用于公开话题。
      </p>
      {props.uploads.length > 0 && (
        <ul className='sf-editor-upload-list'>
          {props.uploads.map((file) => (
            <li key={file.id}>
              <span>
                {file.image ? <ImagePlus /> : <Paperclip />}
                {file.name}
                <small>{Math.max(1, Math.ceil(file.size / 1024))} KB</small>
              </span>
              {props.onInsert && (
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  disabled={busy || props.disabled}
                  aria-label={`插入正文 ${file.name}`}
                  onClick={() => props.onInsert?.(file)}
                >
                  插入正文
                </Button>
              )}
              <Button
                type='button'
                size='icon-sm'
                variant='ghost'
                aria-label={`移除附件 ${file.name}`}
                disabled={busy || props.disabled}
                onClick={() => props.onRemove(file)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title='用导入文件替换正文？'
        desc={`将使用“${pending?.name ?? ''}”替换当前正文，标题和分类不变。取消会保留原正文。`}
        confirmText='替换正文'
        handleConfirm={() => {
          if (pending) props.onImport(pending)
          setPending(null)
        }}
      />
    </div>
  )
}
