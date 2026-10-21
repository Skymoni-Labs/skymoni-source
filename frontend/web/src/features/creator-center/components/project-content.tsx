import { ArrowUpRight, Copy, Download, File } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { ProductImages } from '@/features/shop-preview/components/product-images'

import { listItems } from '../lib/blocks'
import { downloadFile } from '../lib/files'
import { isSafeProjectUrl } from '../lib/schema'
import { settingsFor, type ContentBlock, type Work } from '../types'
import { CoverArt } from './cover-art'

const creatorMarkdownSanitize = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'em',
    's',
    'del',
    'blockquote',
    'pre',
    'code',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'a',
    'hr',
    'details',
    'summary',
  ],
  ALLOWED_ATTR: ['href', 'title', 'align'],
  ADD_ATTR: [],
  ADD_TAGS: [],
}

export function ProjectAccessLinks({ work }: { work: Work }) {
  const { t } = useTranslation()
  const settings = settingsFor(work)
  return (
    <>
      {isSafeProjectUrl(work.url) && (
        <Button
          className='cc-primary cc-project-access-primary'
          style={{ '--cc-project-accent': settings.accent } as CSSProperties}
          render={
            <a href={work.url} target='_blank' rel='noopener noreferrer' />
          }
        >
          {settings.buttonLabel || t('Visit project')}
          <ArrowUpRight aria-hidden />
        </Button>
      )}
      {settings.links
        .filter((link) => link.label.trim() && isSafeProjectUrl(link.url))
        .map((link) => (
          <Button
            key={link.id}
            variant='outline'
            render={
              <a href={link.url} target='_blank' rel='noopener noreferrer' />
            }
          >
            {link.label}
            <ArrowUpRight aria-hidden />
          </Button>
        ))}
    </>
  )
}

function BlockText({
  type,
  text,
}: {
  type: ContentBlock['type']
  text: string
}) {
  const { t } = useTranslation()
  if (type === 'code') {
    return (
      <div className='cc-code-block'>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          aria-label={t('Copy code')}
          onClick={() => {
            void navigator.clipboard
              .writeText(text)
              .then(() => toast.success(t('Copied')))
              .catch(() => toast.error(t('Unable to copy')))
          }}
        >
          <Copy aria-hidden />
        </Button>
        <pre>
          <code>{text}</code>
        </pre>
      </div>
    )
  }
  if (type === 'list') {
    return (
      <ol className='cc-composition-list'>
        {listItems(text).map((line) => (
          <li key={line.key}>{line.text}</li>
        ))}
      </ol>
    )
  }
  return <p className='cc-project-body'>{text}</p>
}

function BlockContent({ block, work }: { block: ContentBlock; work: Work }) {
  const { t } = useTranslation()
  const title = work.sample ? t(block.title) : block.title
  const text = work.sample ? t(block.text) : block.text
  if (block.type === 'divider') return <hr className='cc-composition-divider' />
  if (block.type === 'markdown') {
    return (
      <section className='cc-content-box'>
        {title && <h2>{title}</h2>}
        <Markdown
          baseUrl={
            isSafeProjectUrl(block.url) ? block.url : 'https://github.com/'
          }
          sanitizeOptions={creatorMarkdownSanitize}
        >
          {text}
        </Markdown>
      </section>
    )
  }
  if (block.type === 'heading') {
    return title ? <h2 className='cc-composition-heading'>{title}</h2> : null
  }
  if (block.type === 'gallery') {
    return work.images?.length ? (
      <section className='cc-content-box cc-composition-gallery'>
        <ProductImages
          enabled
          images={work.images}
          name={work.title}
          label={title || t('Project images')}
          imageLayout='portrait'
        />
      </section>
    ) : null
  }
  if (block.type === 'link') {
    return isSafeProjectUrl(block.url) ? (
      <a
        className='cc-composition-link'
        href={block.url}
        target='_blank'
        rel='noopener noreferrer'
      >
        <div>
          <strong>{title || new URL(block.url).hostname}</strong>
          <p>{text || block.url}</p>
        </div>
        <ArrowUpRight aria-hidden />
      </a>
    ) : null
  }
  if (!title && !text) return null
  return (
    <section className={`cc-content-box cc-composition-${block.type}`}>
      {title && <h2>{title}</h2>}
      <BlockText type={block.type} text={text} />
    </section>
  )
}

export function ProjectContent({ work }: { work: Work }) {
  const { t } = useTranslation()
  const settings = settingsFor(work)
  return (
    <div
      className='cc-work-presentation'
      data-layout={settings.layout}
      data-ratio={settings.coverRatio}
      style={{ '--cc-project-accent': settings.accent } as CSSProperties}
    >
      {settings.showCover && (
        <CoverArt work={work} className='cc-detail-cover' />
      )}
      {settings.showDescription && work.description && (
        <section className='cc-content-box'>
          <h2>{t('About this project')}</h2>
          <p className='cc-project-body'>
            {work.sample ? t(work.description) : work.description}
          </p>
        </section>
      )}
      {settings.showGallery && (work.images?.length ?? 0) > 0 && (
        <section className='cc-content-box'>
          <ProductImages
            enabled
            images={work.images}
            name={work.title}
            label={t('Project images')}
            imageLayout='portrait'
          />
        </section>
      )}
      {work.blocks
        ?.filter((block) => block.visible)
        .map((block) => (
          <BlockContent key={block.id} block={block} work={work} />
        ))}
      {settings.showFiles && work.attachment && (
        <section className='cc-content-box'>
          <h2>{t('Project files')}</h2>
          <div className='cc-file-row'>
            <File aria-hidden />
            <span>
              {work.attachment.name}
              <small>{t('Stored on this device only')}</small>
            </span>
            <Button
              variant='outline'
              onClick={() => {
                if (work.attachment) {
                  void downloadFile(
                    work.attachment.id,
                    work.attachment.name
                  ).catch(() => toast.error(t('Attachment unavailable')))
                }
              }}
            >
              <Download aria-hidden />
              {t('Download')}
            </Button>
          </div>
        </section>
      )}
      {settings.metadata.some((field) => field.label && field.value) && (
        <section className='cc-content-box'>
          <h2>{t('Project information')}</h2>
          <dl className='cc-composition-metadata'>
            {settings.metadata
              .filter((field) => field.label && field.value)
              .map((field) => (
                <div key={field.id}>
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
          </dl>
        </section>
      )}
      {settings.usage && (
        <section className='cc-content-box'>
          <h2>{t('Usage permissions')}</h2>
          <p className='cc-project-body'>{settings.usage}</p>
        </section>
      )}
    </div>
  )
}
