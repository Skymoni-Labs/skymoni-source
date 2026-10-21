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
  ArrowDown,
  ArrowUp,
  Code2,
  Heading,
  ImagePlus,
  List,
  Loader2,
  Minus,
  Plus,
  Quote,
  Trash2,
  Type,
} from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import { DocImage } from './content'
import { useDocImageUpload } from './image-upload'
import { moveBlock, type DocBlock, type DocPage } from './types'

const library = [
  { type: 'heading', label: '标题', icon: Heading },
  { type: 'text', label: '正文', icon: Type },
  { type: 'image', label: '图片', icon: ImagePlus },
  { type: 'code', label: '代码', icon: Code2 },
  { type: 'list', label: '步骤', icon: List },
  { type: 'callout', label: '提示', icon: Quote },
  { type: 'divider', label: '分隔线', icon: Minus },
] as const
export function DocEditor({
  page,
  onChange,
  busy,
  onUploadingChange,
}: {
  page: DocPage
  onChange: (page: DocPage) => void
  busy: boolean
  onUploadingChange?: (uploading: boolean) => void
}) {
  const { uploading, uploadFiles } = useDocImageUpload(
    page,
    onChange,
    onUploadingChange
  )
  const activeBlock = useRef<string | undefined>(undefined)
  const [dragging, setDragging] = useState(false)
  const patch = (id: string, update: Partial<DocBlock>) =>
    onChange({
      ...page,
      blocks: page.blocks.map((b) => (b.id === id ? { ...b, ...update } : b)),
    })
  const add = (type: DocBlock['type'], afterID?: string) => {
    const block: DocBlock = {
      id: crypto.randomUUID(),
      type,
      text: type === 'list' ? '1. 第一步\n2. 第二步' : '',
      url: '',
      level: 2,
    }
    const blocks = [...page.blocks]
    const index = blocks.findIndex(
      (b) => b.id === (afterID ?? activeBlock.current)
    )
    blocks.splice(index < 0 ? blocks.length : index + 1, 0, block)
    onChange({ ...page, blocks })
    activeBlock.current = block.id
    requestAnimationFrame(() =>
      document.getElementById(`edit-${block.id}`)?.focus()
    )
  }
  return (
    <fieldset
      className='ud-editor'
      disabled={busy || !!uploading}
      onFocusCapture={(event) => {
        const block = (event.target as HTMLElement).closest<HTMLElement>(
          '[data-edit-block]'
        )
        if (block) activeBlock.current = block.dataset.editBlock
      }}
      onPaste={(event) => {
        const files = [...event.clipboardData.files]
        if (!files.length) return
        event.preventDefault()
        if (!busy && !uploading) void uploadFiles(files, activeBlock.current)
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
          event.dataTransfer.dropEffect = busy || uploading ? 'none' : 'copy'
        }
      }}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes('Files') && !busy && !uploading) {
          setDragging(true)
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false)
        }
      }}
      onDrop={(event) => {
        const files = [...event.dataTransfer.files]
        if (!files.length) return
        event.preventDefault()
        setDragging(false)
        const block = (event.target as HTMLElement).closest<HTMLElement>(
          '[data-edit-block]'
        )
        if (!busy && !uploading) {
          void uploadFiles(
            files,
            block?.dataset.editBlock ?? activeBlock.current
          )
        }
      }}
    >
      <Input
        aria-label='文档标题'
        className='ud-title-input'
        value={page.title}
        maxLength={160}
        onChange={(e) => onChange({ ...page, title: e.target.value })}
      />
      <Textarea
        aria-label='文档简介'
        placeholder='写一句简介，帮助读者快速了解这篇教程…'
        value={page.summary}
        maxLength={1000}
        onChange={(e) => onChange({ ...page, summary: e.target.value })}
      />
      <div className='ud-meta-inputs'>
        <label>
          所属分类
          <Input
            value={page.category}
            maxLength={60}
            onChange={(e) => onChange({ ...page, category: e.target.value })}
          />
        </label>
        <label>
          目录顺序
          <Input
            type='number'
            min={0}
            max={10000}
            value={page.order}
            onChange={(e) =>
              onChange({
                ...page,
                order: Math.min(10000, Math.max(0, Number(e.target.value))),
              })
            }
          />
        </label>
      </div>
      <div className='ud-add-bar' aria-label='添加内容块'>
        {library.map(({ type, label, icon: Icon }) => (
          <Button
            key={type}
            variant='ghost'
            size='sm'
            onClick={() => add(type)}
            disabled={page.blocks.length >= 200}
          >
            <Icon />
            {label}
          </Button>
        ))}
      </div>
      <p className='ud-editor-tip'>
        选择「标题」写章节，左侧会自动生成目录。正文支持
        Markdown，可写粗体、链接、列表和表格。
      </p>
      <label
        className={`ud-image-drop${dragging ? ' ud-image-drop-active' : ''}`}
      >
        {uploading ? <Loader2 className='animate-spin' /> : <ImagePlus />}
        <span>
          <strong role={uploading ? 'status' : undefined}>
            {uploading || '上传图片 · 拖入或粘贴截图'}
          </strong>
          <small>
            可选多张，PNG / JPG / GIF / WebP，每张 5 MB
            以内。插在当前内容块下方。
          </small>
        </span>
        <input
          type='file'
          aria-label='插入图片'
          multiple
          accept='image/png,image/jpeg,image/gif,image/webp'
          disabled={busy || !!uploading || page.blocks.length >= 200}
          onChange={(event) => {
            const files = [...(event.target.files ?? [])]
            event.target.value = ''
            void uploadFiles(files, activeBlock.current)
          }}
        />
      </label>
      <div className='ud-editor-blocks'>
        {page.blocks.map((block, index) => (
          <div
            key={block.id}
            id={`block-${block.id}`}
            data-edit-block={block.id}
            className={`ud-edit-block ud-edit-${block.type}`}
          >
            <div className='ud-block-controls'>
              <span>
                {library.find((item) => item.type === block.type)?.label}
              </span>
              {block.type === 'heading' && (
                <select
                  aria-label={`标题 ${index + 1} 的级别`}
                  value={block.level}
                  onChange={(e) =>
                    patch(block.id, { level: Number(e.target.value) })
                  }
                >
                  <option value={1}>一级标题</option>
                  <option value={2}>二级标题</option>
                  <option value={3}>三级标题</option>
                </select>
              )}
              <Button
                variant='ghost'
                size='icon-xs'
                disabled={index === 0}
                aria-label={`上移内容块 ${index + 1}`}
                onClick={() =>
                  onChange({
                    ...page,
                    blocks: moveBlock(page.blocks, block.id, -1),
                  })
                }
              >
                <ArrowUp />
              </Button>
              <Button
                variant='ghost'
                size='icon-xs'
                disabled={index === page.blocks.length - 1}
                aria-label={`下移内容块 ${index + 1}`}
                onClick={() =>
                  onChange({
                    ...page,
                    blocks: moveBlock(page.blocks, block.id, 1),
                  })
                }
              >
                <ArrowDown />
              </Button>
              <Button
                variant='ghost'
                size='icon-xs'
                aria-label={`在内容块 ${index + 1} 下方插入图片`}
                disabled={page.blocks.length >= 200}
                onClick={() => add('image', block.id)}
              >
                <ImagePlus />
              </Button>
              <Button
                variant='ghost'
                size='icon-xs'
                aria-label={`删除内容块 ${index + 1}`}
                onClick={() =>
                  onChange({
                    ...page,
                    blocks: page.blocks.filter((b) => b.id !== block.id),
                  })
                }
              >
                <Trash2 />
              </Button>
            </div>
            {block.type === 'image' && (
              <>
                <Input
                  aria-label={`图片 ${index + 1} 地址`}
                  placeholder='粘贴图片网址，或从本机上传'
                  value={block.url}
                  onChange={(e) => patch(block.id, { url: e.target.value })}
                />
                <label className='ud-upload'>
                  <ImagePlus />
                  {block.url ? '替换图片' : '选择图片'}（5 MB
                  以内，也可拖入或粘贴）
                  <input
                    type='file'
                    aria-label={`为内容块 ${index + 1} 选择图片`}
                    accept='image/png,image/jpeg,image/gif,image/webp'
                    disabled={busy || !!uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (!file) return
                      void uploadFiles([file], undefined, block.id)
                    }}
                  />
                </label>
                <DocImage url={block.url} text={block.text} admin />
              </>
            )}
            {block.type !== 'divider' &&
              (block.type === 'heading' || block.type === 'image' ? (
                <Input
                  id={`edit-${block.id}`}
                  aria-label={`${block.type === 'heading' ? '章节标题' : '图片说明'} ${index + 1}`}
                  value={block.text}
                  placeholder={
                    block.type === 'heading'
                      ? '输入章节标题'
                      : '图片说明（可选）'
                  }
                  maxLength={block.type === 'heading' ? 300 : 2000}
                  onChange={(e) => patch(block.id, { text: e.target.value })}
                />
              ) : (
                <Textarea
                  id={`edit-${block.id}`}
                  aria-label={`内容块 ${index + 1}`}
                  value={block.text}
                  placeholder={
                    block.type === 'code' ? '粘贴代码或配置…' : '写下你的教程…'
                  }
                  rows={Math.min(
                    18,
                    Math.max(3, block.text.split('\n').length)
                  )}
                  onChange={(e) => patch(block.id, { text: e.target.value })}
                />
              ))}
            {block.type === 'divider' && <hr />}
          </div>
        ))}
      </div>
      <Button
        className='ud-add-bottom'
        variant='outline'
        onClick={() => add('text')}
        disabled={page.blocks.length >= 200}
      >
        <Plus />
        继续写正文
      </Button>
    </fieldset>
  )
}
