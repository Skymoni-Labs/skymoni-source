import {
  ArrowDown,
  ArrowUp,
  Code2,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Heading2,
  Image,
  Link2,
  List,
  Minus,
  Plus,
  Quote,
  Trash2,
  Type,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import { reorderBlocks } from '../lib/blocks'
import { createBlock, type BlockType, type ContentBlock } from '../types'

const blockLibrary: {
  type: BlockType
  label: string
  icon: LucideIcon
}[] = [
  { type: 'heading', label: 'Heading', icon: Heading2 },
  { type: 'text', label: 'Text', icon: Type },
  { type: 'markdown', label: 'Markdown document', icon: Code2 },
  { type: 'gallery', label: 'Image gallery', icon: Image },
  { type: 'link', label: 'Link card', icon: Link2 },
  { type: 'code', label: 'Code & configuration', icon: Code2 },
  { type: 'callout', label: 'Callout', icon: Quote },
  { type: 'list', label: 'Steps & lists', icon: List },
  { type: 'divider', label: 'Divider', icon: Minus },
]

export function BlockComposer(props: {
  blocks: ContentBlock[]
  onChange: (blocks: ContentBlock[]) => void
}) {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState('')
  const active = props.blocks.find((b) => b.id === activeId) ?? props.blocks[0]
  const patch = (update: Partial<ContentBlock>) =>
    props.onChange(
      props.blocks.map((b) => (b.id === active?.id ? { ...b, ...update } : b))
    )
  function move(id: string, offset: number) {
    const index = props.blocks.findIndex((b) => b.id === id)
    const target = props.blocks[index + offset]
    if (target) props.onChange(reorderBlocks(props.blocks, id, target.id))
  }
  return (
    <section className='cc-editor-block cc-composer'>
      <div className='cc-block-heading'>
        <Plus aria-hidden />
        <h2>{t('Build your project page')}</h2>
        <span>{props.blocks.length}/24</span>
      </div>
      <p>
        {t('Mix content blocks. Drag to reorder, or use the arrow buttons.')}
      </p>
      <div className='cc-block-library' aria-label={t('Content block library')}>
        {blockLibrary.map(({ type, label, icon: Icon }) => (
          <Button
            key={type}
            type='button'
            variant='outline'
            disabled={props.blocks.length >= 24}
            onClick={() => {
              const block = createBlock(type)
              props.onChange([...props.blocks, block])
              setActiveId(block.id)
            }}
          >
            <Icon aria-hidden />
            <span>{t(label)}</span>
            <Plus aria-hidden />
          </Button>
        ))}
      </div>
      {!props.blocks.length ? (
        <div className='cc-composer-empty'>
          <Type aria-hidden />
          <strong>{t('A page with room for your ideas')}</strong>
          <p>{t('Choose a block above, or start from a template.')}</p>
        </div>
      ) : (
        <div className='cc-composer-workspace'>
          <ol className='cc-block-outline' aria-label={t('Page structure')}>
            {props.blocks.map((block, index) => {
              const item =
                blockLibrary.find((i) => i.type === block.type) ??
                blockLibrary[0]
              const Icon = item.icon
              return (
                <li
                  key={block.id}
                  className={block.id === active?.id ? 'cc-block-selected' : ''}
                  data-visible={block.visible}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    props.onChange(
                      reorderBlocks(
                        props.blocks,
                        e.dataTransfer.getData('text/plain'),
                        block.id
                      )
                    )
                  }}
                >
                  <button
                    type='button'
                    className='cc-block-drag'
                    draggable
                    aria-label={t('Reorder block {{number}}', {
                      number: index + 1,
                    })}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', block.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.altKey &&
                        ['ArrowUp', 'ArrowDown'].includes(e.key)
                      ) {
                        e.preventDefault()
                        move(block.id, e.key === 'ArrowUp' ? -1 : 1)
                      }
                    }}
                  >
                    <GripVertical aria-hidden />
                  </button>
                  <button
                    type='button'
                    className='cc-block-select'
                    aria-pressed={block.id === active?.id}
                    onClick={() => setActiveId(block.id)}
                  >
                    <Icon aria-hidden />
                    <span>{block.title || t(item.label)}</span>
                  </button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-xs'
                    aria-label={t(
                      block.visible
                        ? 'Hide block {{number}}'
                        : 'Show block {{number}}',
                      { number: index + 1 }
                    )}
                    onClick={() =>
                      props.onChange(
                        props.blocks.map((b) =>
                          b.id === block.id ? { ...b, visible: !b.visible } : b
                        )
                      )
                    }
                  >
                    {block.visible ? (
                      <Eye aria-hidden />
                    ) : (
                      <EyeOff aria-hidden />
                    )}
                  </Button>
                </li>
              )
            })}
          </ol>
          {active && (
            <div className='cc-block-properties' key={active.id}>
              <div className='cc-block-properties-heading'>
                <strong>
                  {t(
                    blockLibrary.find((i) => i.type === active.type)?.label ??
                      'Text'
                  )}
                </strong>
                <div>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-xs'
                    disabled={props.blocks[0].id === active.id}
                    aria-label={t('Move block up')}
                    onClick={() => move(active.id, -1)}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-xs'
                    disabled={props.blocks.at(-1)?.id === active.id}
                    aria-label={t('Move block down')}
                    onClick={() => move(active.id, 1)}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-xs'
                    disabled={props.blocks.length >= 24}
                    aria-label={t('Duplicate block')}
                    onClick={() => {
                      const copy = { ...active, id: crypto.randomUUID() }
                      const next = [...props.blocks]
                      next.splice(
                        next.findIndex((b) => b.id === active.id) + 1,
                        0,
                        copy
                      )
                      props.onChange(next)
                      setActiveId(copy.id)
                    }}
                  >
                    <Copy aria-hidden />
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-xs'
                    aria-label={t('Remove block')}
                    onClick={() =>
                      props.onChange(
                        props.blocks.filter((b) => b.id !== active.id)
                      )
                    }
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
              {active.type !== 'divider' && (
                <label className='cc-control-label'>
                  {t('Block title')}
                  <Input
                    value={active.title}
                    maxLength={120}
                    onChange={(e) => patch({ title: e.target.value })}
                    placeholder={t('Give this section a title')}
                  />
                </label>
              )}
              {!['heading', 'divider', 'gallery'].includes(active.type) && (
                <label className='cc-control-label'>
                  {t(
                    (
                      {
                        code: 'Code content',
                        list: 'One item per line',
                      } as Record<string, string>
                    )[active.type] ?? 'Block content'
                  )}
                  <Textarea
                    value={active.text}
                    maxLength={12000}
                    rows={6}
                    className={active.type === 'code' ? 'cc-code-input' : ''}
                    onChange={(e) => patch({ text: e.target.value })}
                    placeholder={t('Write something here…')}
                  />
                </label>
              )}
              {active.type === 'link' && (
                <label className='cc-control-label'>
                  {t('Destination link')}
                  <Input
                    value={active.url}
                    maxLength={2000}
                    onChange={(e) => patch({ url: e.target.value })}
                    placeholder='https://'
                  />
                </label>
              )}
              {active.type === 'gallery' && (
                <p className='cc-property-note'>
                  {t(
                    'Uses the images uploaded below. Visitors can open each image to see it clearly.'
                  )}
                </p>
              )}
              {active.type === 'divider' && (
                <p className='cc-property-note'>
                  {t('A little breathing room between two ideas.')}
                </p>
              )}
              {!active.visible && (
                <p className='cc-property-note'>
                  {t('This block is hidden in the page preview.')}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
