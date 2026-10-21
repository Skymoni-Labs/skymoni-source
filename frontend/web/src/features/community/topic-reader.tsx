import { Check, ChevronDown, ChevronUp, Copy, List } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

import { CommunityContent } from './content'
import type { TopicFormat } from './types'

import '@/styles/community-reading.css'

type Section = { id: string; title: string; level: number }

function plainText(element: Element): string {
  const copy = element.cloneNode(true) as Element
  copy
    .querySelectorAll('button, [aria-hidden="true"]')
    .forEach((node) => node.remove())
  copy.querySelectorAll('br').forEach((node) => node.replaceWith('\n'))
  copy
    .querySelectorAll('h1,h2,h3,h4,h5,h6,p,div,pre,li,blockquote,tr')
    .forEach((node) => node.append('\n'))
  return (copy.textContent ?? '')
    .replaceAll(/\r\n?/g, '\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim()
}

function promptText(element: Element): string {
  const heading = [...element.querySelectorAll('h1,h2,h3,h4,h5,h6')].find(
    (node) =>
      /^(完整提示词|提示词正文|提示词|prompt)\s*[:：]?$/i.test(
        node.textContent?.trim() ?? ''
      )
  )
  if (!heading) return plainText(element)
  const parts: string[] = []
  const level = Number(heading.tagName.slice(1))
  for (
    let node = heading.nextElementSibling;
    node;
    node = node.nextElementSibling
  ) {
    if (
      /^H[1-6]$/.test(node.tagName) &&
      Number(node.tagName.slice(1)) <= level
    ) {
      break
    }
    const text = plainText(node)
    if (text) parts.push(text)
  }
  return parts.join('\n\n').trim() || plainText(element)
}

export function TopicReader({
  content,
  format,
  prompt = false,
}: {
  content: string
  format?: TopicFormat
  prompt?: boolean
}) {
  const body = useRef<HTMLDivElement>(null)
  const bodyId = `topic-body-${useId().replaceAll(/[^a-zA-Z0-9_-]/g, '')}`
  const [sections, setSections] = useState<Section[]>([])
  const [long, setLong] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [copying, setCopying] = useState(false)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!body.current) return
    const text = plainText(body.current)
    setLong(text.length > 1600 || text.split('\n').length > 35)
    setSections(
      [...body.current.querySelectorAll('h1,h2,h3,h4,h5,h6')]
        .map((heading, index) => {
          const id = `${bodyId}-section-${index + 1}`
          heading.id = id
          heading.setAttribute('tabindex', '-1')
          return {
            id,
            title: heading.textContent?.trim() ?? '',
            level: Number(heading.tagName.slice(1)),
          }
        })
        .filter((section) => section.title)
        .slice(0, 50)
    )
    setExpanded(false)
    setCopied(false)
    setMessage('')
  }, [bodyId, content, format])

  async function copy() {
    if (!body.current) return
    setCopying(true)
    setCopied(false)
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable')
      }
      await navigator.clipboard.writeText(
        prompt ? promptText(body.current) : plainText(body.current)
      )
      setCopied(true)
      setMessage(prompt ? '提示词已复制，可直接粘贴使用。' : '正文已复制。')
    } catch {
      setMessage('复制未成功，请允许剪贴板访问或手动选择正文复制。')
    } finally {
      setCopying(false)
    }
  }

  let copyLabel = prompt ? '一键复制提示词' : '复制正文'
  if (copied) copyLabel = '已复制'
  if (copying) copyLabel = '正在复制…'

  return (
    <section className='sf-topic-reader' aria-label='正文阅读工具'>
      <div className='sf-reading-toolbar'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={copying}
          onClick={() => void copy()}
        >
          {copied ? <Check /> : <Copy />}
          {copyLabel}
        </Button>
        {long && (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            aria-controls={bodyId}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp /> : <ChevronDown />}
            {expanded ? '收起正文' : '展开全文'}
          </Button>
        )}
        <span role='status' aria-live='polite'>
          {message}
        </span>
      </div>
      {sections.length > 1 && (
        <details className='sf-reading-directory' open>
          <summary>
            <List size={16} />
            长文目录
          </summary>
          <nav aria-label='正文目录'>
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                data-level={section.level}
                onClick={(event) => {
                  event.preventDefault()
                  setExpanded(true)
                  requestAnimationFrame(() => {
                    const target = document.querySelector<HTMLElement>(
                      `#${section.id}`
                    )
                    target?.scrollIntoView?.({
                      block: 'start',
                      behavior: window.matchMedia?.(
                        '(prefers-reduced-motion: reduce)'
                      ).matches
                        ? 'auto'
                        : 'smooth',
                    })
                    target?.focus({ preventScroll: true })
                  })
                }}
              >
                {section.title}
              </a>
            ))}
          </nav>
        </details>
      )}
      <div
        className={`sf-reading-body${long && !expanded ? ' sf-reading-collapsed' : ''}`}
        id={bodyId}
        ref={body}
      >
        <CommunityContent format={format} className='sf-post-content'>
          {content}
        </CommunityContent>
      </div>
      {long && (
        <Button
          type='button'
          className='sf-reading-toggle'
          variant='outline'
          aria-controls={bodyId}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp /> : <ChevronDown />}
          {expanded ? '收起正文' : '展开全文，继续阅读'}
        </Button>
      )}
    </section>
  )
}
