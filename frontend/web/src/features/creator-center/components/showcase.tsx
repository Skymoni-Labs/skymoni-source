import { Link } from '@tanstack/react-router'
import {
  AppWindow,
  ArrowUpRight,
  Globe,
  Palette,
  Sparkles,
  Workflow,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { publicNickname } from '@/lib/public-nickname'

import { showcaseTopics } from '../lib/showcase'
import { categoryLabel, type Work } from '../types'
import { CoverArt } from './cover-art'

const topicIcons = { Globe, AppWindow, Palette, Workflow }

export function Spotlight({
  work,
  primary = false,
}: {
  work: Work
  primary?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Link
      className={`cs-spotlight ${primary ? 'cs-spotlight-primary' : 'cs-spotlight-side'}`}
      to='/creators/works/$workId'
      params={{ workId: work.id }}
    >
      <div className='cs-spotlight-art'>
        <CoverArt work={work} />
        <span className='cs-example-badge'>
          {t(work.sample ? 'Example project' : 'Creator project')}
        </span>
      </div>
      <div className='cs-spotlight-copy'>
        <span className='cs-spotlight-label'>
          <Sparkles aria-hidden />
          {t(
            primary
              ? 'A project worth a closer look'
              : categoryLabel(work.category)
          )}
        </span>
        <h2>{t(work.title)}</h2>
        <p>{t(work.summary)}</p>
        <span className='cs-spotlight-footer'>
          <span>
            {publicNickname(work.author)}{' '}
            {work.sample && <small>· {t('Example creator')}</small>}
          </span>
          <span>
            {t('View project')}
            <ArrowUpRight aria-hidden />
          </span>
        </span>
      </div>
    </Link>
  )
}

export function TopicCollection({
  onChoose,
}: {
  onChoose: (category: string) => void
}) {
  const { t } = useTranslation()
  return (
    <section className='cs-topic-grid' aria-label={t('Explore by interest')}>
      {showcaseTopics.map((topic) => {
        const Icon = topicIcons[topic.icon]
        return (
          <Button
            variant='ghost'
            type='button'
            key={topic.category}
            onClick={() => onChoose(topic.category)}
            className={`cs-topic cs-topic-${topic.category} h-auto justify-start whitespace-normal`}
          >
            <span>
              <Icon aria-hidden />
            </span>
            <div className='break-words'>
              <strong>{t(topic.label)}</strong>
              <small>{t(topic.note)}</small>
            </div>
            <ArrowUpRight aria-hidden />
          </Button>
        )
      })}
    </section>
  )
}
