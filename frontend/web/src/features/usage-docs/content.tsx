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
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Maximize2,
  Minus,
  Plus,
} from 'lucide-react'
import { createElement, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Markdown } from '@/components/ui/markdown'

import { draftImageBlob } from './api'
import { safeImageURL, type DocPage, type OutlineItem } from './types'

export function DocImage({
  url,
  text,
  admin,
}: {
  url: string
  text: string
  admin: boolean
}) {
  const [resourceState, setResourceState] = useState({
    url: '',
    blob: '',
    failed: false,
  })
  const [retry, setRetry] = useState(0)
  const [open, setOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    if (!admin || !url.startsWith('/api/docs/images/')) return
    const controller = new AbortController()
    let resource = ''
    void draftImageBlob(url, controller.signal)
      .then((src) => {
        resource = src
        if (controller.signal.aborted) URL.revokeObjectURL(src)
        else setResourceState({ url, blob: src, failed: false })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResourceState({ url, blob: '', failed: true })
        }
      })
    return () => {
      controller.abort()
      if (resource) URL.revokeObjectURL(resource)
    }
  }, [url, admin, retry])
  if (!safeImageURL(url)) return null
  if (resourceState.url === url && resourceState.failed) {
    return (
      <div className='ud-image-error' role='alert'>
        <span>图片加载失败，请检查地址或重新上传。</span>
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            setResourceState({ url: '', blob: '', failed: false })
            setRetry((value) => value + 1)
          }}
        >
          重新加载
        </Button>
      </div>
    )
  }
  const src =
    admin && url.startsWith('/api/docs/images/')
      ? resourceState.url === url && resourceState.blob
      : url
  return (
    <figure>
      {src ? (
        <>
          <button
            type='button'
            className='ud-image-button'
            aria-label={`查看大图：${text || '教程配图'}`}
            onClick={() => {
              setZoom(1)
              setOpen(true)
            }}
          >
            <img
              key={retry}
              src={src}
              alt={text || '教程配图'}
              loading='lazy'
              onError={() => setResourceState({ url, blob: '', failed: true })}
            />
            <span className='ud-image-hint'>
              <Maximize2 />
              查看大图
            </span>
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className='ud-image-dialog'>
              <DialogHeader>
                <DialogTitle>图片预览</DialogTitle>
              </DialogHeader>
              <div className='ud-image-zoom'>
                <Button
                  variant='outline'
                  size='icon-sm'
                  aria-label='缩小图片'
                  disabled={zoom <= 1}
                  onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
                >
                  <Minus />
                </Button>
                <span aria-live='polite'>{Math.round(zoom * 100)}%</span>
                <Button
                  variant='outline'
                  size='icon-sm'
                  aria-label='放大图片'
                  disabled={zoom >= 3}
                  onClick={() => setZoom((value) => Math.min(3, value + 0.5))}
                >
                  <Plus />
                </Button>
                <Button variant='ghost' size='sm' onClick={() => setZoom(1)}>
                  适应窗口
                </Button>
                <a href={src} target='_blank' rel='noopener noreferrer'>
                  <ExternalLink />
                  打开原图
                </a>
              </div>
              <div
                className='ud-image-canvas'
                tabIndex={0}
                aria-label='图片，可放大并滚动查看'
              >
                <img
                  src={src}
                  alt={text || '教程配图'}
                  style={{
                    width: zoom === 1 ? 'auto' : `${zoom * 100}%`,
                    maxWidth: zoom === 1 ? '100%' : 'none',
                    maxHeight: zoom === 1 ? '65dvh' : 'none',
                  }}
                />
              </div>
              {text && <p className='ud-image-caption'>{text}</p>}
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <div className='ud-image-loading' role='status'>
          <Loader2 className='animate-spin' />
          正在加载图片…
        </div>
      )}
      {text && <figcaption>{text}</figcaption>}
    </figure>
  )
}
function CodeContent({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className='ud-code'>
      <Button
        variant='ghost'
        size='icon-xs'
        aria-label='复制代码'
        onClick={() => {
          void navigator.clipboard
            .writeText(text)
            .then(() => setCopied(true))
            .catch(() => setCopied(false))
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  )
}
export function DocContent({
  page,
  admin = false,
  onOutline,
}: {
  page: DocPage
  admin?: boolean
  onOutline: (items: OutlineItem[]) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    root.current
      ?.querySelectorAll<HTMLAnchorElement>('a[href]')
      .forEach((link) => {
        try {
          const url = new URL(
            link.getAttribute('href') || '',
            window.location.href
          )
          if (
            url.origin === window.location.origin &&
            url.pathname === '/docs'
          ) {
            link.removeAttribute('target')
          }
        } catch {
          // Invalid links keep the Markdown renderer's sanitized output.
        }
      })
    const items: OutlineItem[] = []
    root.current?.querySelectorAll('[data-doc-block]').forEach((block) => {
      block.querySelectorAll('h1,h2,h3').forEach((heading, index) => {
        const id = `section-${block.getAttribute('data-doc-block')}-${index}`
        heading.id = id
        items.push({
          id,
          text: heading.textContent || '',
          level: Number(heading.tagName.slice(1)),
        })
      })
    })
    onOutline(items)
    if (window.location.hash) {
      const target = document.getElementById(window.location.hash.slice(1))
      if (target && root.current?.contains(target)) {
        target.scrollIntoView({ block: 'start' })
      }
    }
  }, [page, onOutline])
  return (
    <div ref={root} className='ud-content'>
      {page.blocks.map((block) => (
        <section key={block.id} data-doc-block={block.id}>
          {block.type === 'heading' &&
            createElement(
              `h${Math.min(3, Math.max(1, block.level))}`,
              null,
              block.text
            )}
          {(block.type === 'text' || block.type === 'list') && (
            <Markdown
              className='ud-markdown'
              sanitizeOptions={{
                FORBID_TAGS: [
                  'img',
                  'iframe',
                  'style',
                  'script',
                  'input',
                  'form',
                ],
              }}
            >
              {block.text}
            </Markdown>
          )}
          {block.type === 'callout' && (
            <aside className='ud-callout'>
              <Markdown
                className='ud-markdown'
                sanitizeOptions={{
                  FORBID_TAGS: [
                    'img',
                    'iframe',
                    'style',
                    'script',
                    'input',
                    'form',
                  ],
                }}
              >
                {block.text}
              </Markdown>
            </aside>
          )}
          {block.type === 'image' && (
            <DocImage url={block.url} text={block.text} admin={admin} />
          )}
          {block.type === 'code' && <CodeContent text={block.text} />}
          {block.type === 'divider' && <hr />}
        </section>
      ))}
    </div>
  )
}
