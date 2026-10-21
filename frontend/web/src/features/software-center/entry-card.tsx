import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'

import { SoftwareArtwork } from './artwork'
import {
  SoftwareAction,
  SoftwareCardDetailsLink,
  SoftwareStoreAction,
} from './software-card'
import type { SoftwareEntry } from './types'

export function SoftwareEntryCard(props: { entry: SoftwareEntry }) {
  const { t } = useTranslation()
  const entry = props.entry
  return (
    <Card
      id={entry.id}
      className='sc-app-card'
      data-appearance={entry.appearance}
      role='article'
      aria-label={t(entry.name, { defaultValue: entry.name })}
    >
      <SoftwareCardDetailsLink entry={entry} />
      <CardHeader className='sc-app-header'>
        <SoftwareArtwork entry={entry} />
        <div className='sc-app-meta'>
          <h3 title={entry.name}>
            {t(entry.name, { defaultValue: entry.name })}
          </h3>
          <p>{entry.platform}</p>
          <span>
            {entry.version
              ? `${t('Listed version')} v${entry.version}`
              : t('Version: refer to the official website')}
          </span>
        </div>
      </CardHeader>
      <CardContent className='sc-app-description'>
        <p>{t(entry.description, { defaultValue: entry.description })}</p>
      </CardContent>
      <CardFooter className='sc-app-footer'>
        <Badge variant='secondary'>
          {t(
            entry.details?.category?.trim() ||
              (entry.kind === 'software' ? 'Software' : 'Tool')
          )}
        </Badge>
        <div className='sc-app-actions'>
          <Button
            variant='ghost'
            size='sm'
            role='link'
            className='sc-app-detail'
            render={
              <Link
                to='/software/$softwareId'
                params={{ softwareId: entry.id }}
              />
            }
            aria-label={t('View details for {{name}}', { name: entry.name })}
          >
            <span>{t('View details')}</span>
            <ArrowRight aria-hidden />
          </Button>
          <SoftwareStoreAction entry={entry} />
          <SoftwareAction entry={entry} />
        </div>
      </CardFooter>
    </Card>
  )
}
