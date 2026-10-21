import {
  ArrowLeft01Icon,
  ComputerIcon,
  GridViewIcon,
  SmartPhone01Icon,
  ToolsIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import {
  defaultCatalogFilters,
  softwareTopic,
  type CatalogFilters,
} from './catalog-browsing'
import type { SoftwareEntry } from './types'

const kinds = [
  { value: 'all', label: 'All apps', icon: GridViewIcon },
  { value: 'software', label: 'Software', icon: ComputerIcon },
  { value: 'tool', label: 'Companion tools', icon: ToolsIcon },
] as const
const platforms = ['Windows', 'Android', 'macOS', 'Linux', 'iOS', 'Web']

export function SoftwareCatalogFilters(props: {
  entries: SoftwareEntry[]
  filters: CatalogFilters
  onChange: (filters: CatalogFilters) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const scoped = props.entries.filter(
    (entry) => props.filters.kind === 'all' || entry.kind === props.filters.kind
  )
  const topics = [...new Set(scoped.map(softwareTopic))].sort((a, b) => {
    if (a === 'category:角色扮演') return -1
    if (b === 'category:角色扮演') return 1
    return 0
  })
  return (
    <div className='sc-browse-filters'>
      <div className='sc-browse-types'>
        <ToggleGroup
          className='sc-kind-tabs'
          value={[props.filters.kind]}
          onValueChange={(values) => {
            const kind = values[0]
            if (kind === 'all' || kind === 'software' || kind === 'tool') {
              props.onChange({
                ...props.filters,
                kind,
                platform: 'all',
                topic: 'all',
              })
            }
          }}
          aria-label={t('Browse by type')}
          spacing={1}
        >
          {kinds.map((kind) => (
            <ToggleGroupItem
              key={kind.value}
              value={kind.value}
              aria-label={t(kind.label)}
            >
              <HugeiconsIcon icon={kind.icon} aria-hidden />
              {t(kind.label)}
              <span className='sc-filter-count' aria-hidden>
                {formatNumber(
                  props.entries.filter(
                    (entry) => kind.value === 'all' || entry.kind === kind.value
                  ).length,
                  locale
                )}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {props.filters.kind !== 'all' && (
          <Button
            variant='ghost'
            size='sm'
            className='sc-back-overview'
            onClick={() => props.onChange(defaultCatalogFilters)}
          >
            <HugeiconsIcon
              icon={ArrowLeft01Icon}
              data-icon='inline-start'
              aria-hidden
            />
            {t('Back to overview')}
          </Button>
        )}
      </div>
      {topics.length > 1 && (
        <div className='sc-filter-row'>
          <span className='sc-filter-label'>{t('Category')}</span>
          <ToggleGroup
            className='sc-filter-chips'
            value={[props.filters.topic]}
            onValueChange={(values) => {
              if (values[0]) {
                props.onChange({ ...props.filters, topic: values[0] })
              }
            }}
            aria-label={t('Filter by category')}
            spacing={1}
          >
            <ToggleGroupItem value='all'>{t('All categories')}</ToggleGroupItem>
            {topics.map((topic) => (
              <ToggleGroupItem key={topic} value={topic}>
                {t(topic.slice('category:'.length) || 'Other')}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
      <div className='sc-filter-row'>
        <span className='sc-filter-label'>{t('Platform')}</span>
        <ToggleGroup
          className='sc-filter-chips'
          value={[props.filters.platform]}
          onValueChange={(values) => {
            if (values[0]) {
              props.onChange({ ...props.filters, platform: values[0] })
            }
          }}
          aria-label={t('Filter by platform')}
          spacing={1}
        >
          <ToggleGroupItem value='all'>{t('All platforms')}</ToggleGroupItem>
          {platforms
            .filter((platform) =>
              scoped.some((entry) =>
                entry.platform.toLowerCase().includes(platform.toLowerCase())
              )
            )
            .map((platform) => (
              <ToggleGroupItem key={platform} value={platform}>
                <HugeiconsIcon
                  icon={
                    platform === 'Android' || platform === 'iOS'
                      ? SmartPhone01Icon
                      : ComputerIcon
                  }
                  aria-hidden
                />
                {platform}
              </ToggleGroupItem>
            ))}
        </ToggleGroup>
      </div>
    </div>
  )
}
