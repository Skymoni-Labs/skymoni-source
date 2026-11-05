import { Link } from '@tanstack/react-router'
import { ArrowRight, Puzzle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'

import { SkivuPluginInstall } from './skivu-plugin-install'
import { skivuPluginCategory, type SkivuPluginEntry } from './skivu-plugins'

export function SkivuPluginCard({ entry }: { entry: SkivuPluginEntry }) {
  const { t } = useTranslation()
  return (
    <Card
      id={entry.id}
      className='sc-app-card'
      data-appearance='generic'
      role='article'
      aria-label={entry.name}
    >
      <Link
        className='sc-card-link'
        to='/software/$softwareId'
        params={{ softwareId: entry.id }}
        aria-label={entry.name}
      />
      <CardHeader className='sc-app-header'>
        <div className='sc-artwork sc-artwork-generic'>
          <Puzzle aria-hidden />
        </div>
        <div className='sc-app-meta'>
          <h3 title={entry.name}>{entry.name}</h3>
          <p>Skivu ≥ {entry.minHostVersion} · Android</p>
          <span>
            {t('Listed version')} v{entry.version}
          </span>
        </div>
      </CardHeader>
      <CardContent className='sc-app-description'>
        <p>{entry.description}</p>
      </CardContent>
      <CardFooter className='sc-app-footer'>
        <Badge variant='secondary'>{t(skivuPluginCategory(entry))}</Badge>
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
            {t('View details')}
            <ArrowRight aria-hidden />
          </Button>
          <SkivuPluginInstall entry={entry} />
        </div>
      </CardFooter>
    </Card>
  )
}
