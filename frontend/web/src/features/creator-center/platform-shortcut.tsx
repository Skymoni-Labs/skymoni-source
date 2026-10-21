import { ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

export function CreatorPlatformShortcut() {
  const { t } = useTranslation()
  return (
    <section className='space-y-4 rounded-xl border p-6'>
      <h2 className='text-xl font-semibold'>{t('skymoni Community')}</h2>
      <p className='text-muted-foreground'>
        {t(
          'Manage creator content and homepage displays in the creator platform.'
        )}
      </p>
      <Button render={<a href='/creators/manage' />}>
        {t('Open creator management')}
        <ArrowUpRight aria-hidden />
      </Button>
    </section>
  )
}
