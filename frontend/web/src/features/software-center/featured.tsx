import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'

import { SoftwareArtwork } from './artwork'
import { resolveSoftwareFeatured } from './featured-selection'
import {
  SoftwareAction,
  SoftwareCardDetailsLink,
  SoftwareStoreAction,
} from './software-card'
import type { SoftwareEntry, SoftwareFeaturedConfig } from './types'

const carouselOptions = { loop: true, align: 'start' as const }

export function SoftwareFeatured(props: {
  entries: SoftwareEntry[]
  config?: SoftwareFeaturedConfig
}) {
  const { t } = useTranslation()
  const [api, setApi] = useState<CarouselApi>()
  const [selected, setSelected] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [keyboardFocused, setKeyboardFocused] = useState(false)
  const pointerFocus = useRef(false)
  const [dragging, setDragging] = useState(false)
  const [pageVisible, setPageVisible] = useState(() => !document.hidden)
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const { carousel: featured, tiles } = resolveSoftwareFeatured(
    props.entries,
    props.config
  )
  const rotating =
    !hovered &&
    !keyboardFocused &&
    !dragging &&
    pageVisible &&
    !reducedMotion &&
    featured.length > 1
  useEffect(() => {
    if (!api) return
    const update = () => setSelected(api.selectedScrollSnap())
    const dragStart = () => setDragging(true)
    const dragEnd = () => setDragging(false)
    update()
    api.on('select', update)
    api.on('reInit', update)
    api.on('pointerDown', dragStart)
    api.on('pointerUp', dragEnd)
    return () => {
      api.off('select', update)
      api.off('reInit', update)
      api.off('pointerDown', dragStart)
      api.off('pointerUp', dragEnd)
    }
  }, [api])
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  useEffect(() => {
    if (!api || !rotating) return
    const timer = window.setTimeout(() => api.scrollNext(), 4000)
    return () => window.clearTimeout(timer)
  }, [api, rotating, selected])
  if (!featured.length && !tiles.length) return null
  return (
    <section
      id='software-featured'
      className={cn(
        'sc-featured',
        (!tiles.length || !featured.length) && 'sc-featured-single'
      )}
      aria-label={t('Featured recommendations')}
    >
      {featured.length > 0 && (
        <Carousel
          key={featured.map((entry) => entry.id).join(':')}
          opts={carouselOptions}
          setApi={setApi}
          className='sc-feature-carousel'
          data-rotating={rotating}
          aria-label={t('Featured recommendations')}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onPointerDownCapture={() => {
            pointerFocus.current = true
            setKeyboardFocused(false)
          }}
          onKeyDownCapture={() => {
            pointerFocus.current = false
            setKeyboardFocused(true)
          }}
          onFocusCapture={() => setKeyboardFocused(!pointerFocus.current)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              pointerFocus.current = false
              setKeyboardFocused(false)
            }
          }}
        >
          <CarouselContent>
            {featured.map((entry, index) => (
              <CarouselItem
                key={entry.id}
                aria-label={entry.name}
                aria-hidden={index !== selected}
                inert={index !== selected}
              >
                <div
                  className={cn(
                    'sc-feature-hero',
                    `sc-feature-${entry.appearance}`
                  )}
                >
                  <SoftwareCardDetailsLink entry={entry} />
                  <div className='sc-feature-orbits' aria-hidden='true'>
                    <i />
                    <i />
                    <span />
                  </div>
                  <div className='sc-feature-copy'>
                    <Badge variant='outline'>
                      <Sparkles aria-hidden='true' />
                      {t('Featured pick')}
                    </Badge>
                    <div className='sc-feature-wordmark'>
                      skymoni <span>/ {t('Software Center')}</span>
                    </div>
                    <h2 title={entry.name}>
                      {t(entry.name, { defaultValue: entry.name })}
                    </h2>
                    <p>
                      {t(entry.description, {
                        defaultValue: entry.description,
                      })}
                    </p>
                    <div className='sc-feature-actions'>
                      <SoftwareAction entry={entry} featured />
                      <SoftwareStoreAction entry={entry} />
                      <Button
                        variant='ghost'
                        role='link'
                        className='sc-feature-detail'
                        render={
                          <Link
                            to='/software/$softwareId'
                            params={{ softwareId: entry.id }}
                          />
                        }
                        aria-label={t('View details for {{name}}', {
                          name: entry.name,
                        })}
                      >
                        {t('View details')}
                        <ArrowUpRight aria-hidden />
                      </Button>
                    </div>
                    <span className='sc-feature-platform'>
                      {entry.platform}
                      {entry.version ? ` · v${entry.version}` : ''}
                    </span>
                  </div>
                  <SoftwareArtwork entry={entry} large />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          {featured.length > 1 && (
            <div className='sc-carousel-controls'>
              <div className='sc-carousel-dots'>
                {featured.map((entry, index) => (
                  <Button
                    key={entry.id}
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('Show {{name}} recommendation', {
                      name: entry.name,
                    })}
                    aria-pressed={selected === index}
                    onClick={() => api?.scrollTo(index)}
                  >
                    <span key={selected} />
                  </Button>
                ))}
              </div>
              <div className='sc-carousel-arrows'>
                <CarouselPrevious
                  className='translate-y-0'
                  aria-label={t('Previous recommendation')}
                />
                <CarouselNext
                  className='translate-y-0'
                  aria-label={t('Next recommendation')}
                />
              </div>
            </div>
          )}
        </Carousel>
      )}
      {tiles.length > 0 && (
        <div className='sc-feature-tiles' data-count={tiles.length}>
          {tiles.map((entry, index) => (
            <div
              key={entry.id}
              className={cn(
                'sc-feature-tile',
                `sc-tile-${entry.appearance}`,
                index === 0 && 'sc-tile-wide'
              )}
            >
              <SoftwareCardDetailsLink entry={entry} />
              <SoftwareArtwork entry={entry} large />
              <div className='sc-tile-copy'>
                <span>
                  {t(
                    entry.kind === 'software'
                      ? 'skymoni software'
                      : 'Companion tools'
                  )}
                </span>
                <h3>{t(entry.name, { defaultValue: entry.name })}</h3>
                {index === 0 && (
                  <p>
                    {t(entry.description, { defaultValue: entry.description })}
                  </p>
                )}
                <div className='sc-tile-actions'>
                  <SoftwareAction entry={entry} />
                  <SoftwareStoreAction entry={entry} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
