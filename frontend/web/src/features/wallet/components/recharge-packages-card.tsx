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
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, ShoppingBag } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { TitledCard } from '@/components/ui/titled-card'
import { PricingConversionGuide } from '@/features/pricing/components/pricing-conversion-guide'
import { toIntlLocale } from '@/i18n/languages'
import { api } from '@/lib/api'
import { formatNumber } from '@/lib/format'

import { rechargeCatalogSchema } from '../lib/recharge-catalog'

export function RechargePackagesCard(props: { redemptionEnabled: boolean }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const catalog = useQuery({
    queryKey: ['recharge-packages'],
    queryFn: async () => {
      const response = await api.get('/recharge-packages.json')
      return rechargeCatalogSchema.parse(response.data)
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
    meta: { errorToast: false },
  })

  return (
    <TitledCard
      title={t('skymoni recharge packages')}
      description={t(
        'One-time credit purchase, no subscription or automatic renewal.'
      )}
      icon={<ShoppingBag aria-hidden='true' />}
      disableHoverEffect
      contentClassName='space-y-5'
      action={
        <Button
          variant='outline'
          role='link'
          render={
            <a
              href='https://catfk.com/order'
              target='_blank'
              rel='noopener noreferrer'
            />
          }
        >
          {t('Catfk order lookup')} <ExternalLink aria-hidden='true' />
        </Button>
      }
    >
      <PricingConversionGuide />
      <ol className='grid list-inside list-decimal gap-2 text-sm sm:grid-cols-3'>
        <li>{t('Choose a package and pay on Catfk')}</li>
        <li>{t('Receive a one-time redemption code')}</li>
        <li>{t('Return here and redeem the code to add credit')}</li>
      </ol>
      <Alert>
        <AlertDescription>
          {t(
            'Prices are in CNY. USD credit is for skymoni model calls only and cannot be redeemed for USD cash or upstream provider credit. Redeem your code to add it to your wallet.'
          )}
        </AlertDescription>
      </Alert>
      {!props.redemptionEnabled && (
        <p role='status' className='text-muted-foreground text-sm'>
          {t(
            'Package purchases are unavailable while redemption is disabled or loading.'
          )}
        </p>
      )}
      {catalog.isPending && (
        <LoadingState message={t('Loading recharge packages...')} />
      )}
      {catalog.isError && (
        <ErrorState
          title={t('Recharge packages are temporarily unavailable')}
          description={t('Your existing codes can still be redeemed below.')}
          onRetry={() => void catalog.refetch()}
        />
      )}
      {!catalog.isPending &&
        !catalog.isError &&
        catalog.data?.plans.length === 0 && (
          <EmptyState title={t('No recharge packages available')} />
        )}
      {!catalog.isError && catalog.data && (
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4'>
          {catalog.data.plans.map((plan) => {
            let statusLabel = t('Platform review pending')
            if (plan.status === 'available') {
              statusLabel = t('Available to purchase')
            }
            if (plan.status === 'sold_out') statusLabel = t('Sold out')
            if (plan.status === 'paused') statusLabel = t('Sales paused')
            const canBuy =
              props.redemptionEnabled && plan.status === 'available'
            return (
              <Card
                key={plan.id}
                data-card-hover='false'
                className='min-w-0 gap-4 py-4'
              >
                <CardHeader className='gap-2 px-4'>
                  <CardTitle>{t('Package {{id}}', { id: plan.id })}</CardTitle>
                  <Badge
                    variant='secondary'
                    className='max-w-full whitespace-normal'
                  >
                    {statusLabel}
                  </Badge>
                </CardHeader>
                <CardContent className='space-y-2 px-4'>
                  <p className='text-3xl font-semibold tracking-tight'>
                    ¥{formatNumber(plan.price_cny, locale)}{' '}
                    <span className='text-muted-foreground text-xs font-normal'>
                      CNY
                    </span>
                  </p>
                  {plan.base_credit && plan.base_credit < plan.credit_usd ? (
                    <div className='space-y-1.5'>
                      <p className='flex items-baseline gap-1.5'>
                        <span className='text-xl font-semibold tracking-tight'>
                          {t('{{amount}} USD credit', {
                            amount: formatNumber(plan.base_credit, locale),
                          })}
                        </span>
                        <span className='text-sm font-medium text-green-600 dark:text-green-400'>
                          +{' '}
                          {Math.round(
                            ((plan.credit_usd - plan.base_credit) /
                              plan.base_credit) *
                              100
                          )}
                          {t('% bonus credit')}
                        </span>
                      </p>
                      <p className='bg-primary/10 text-primary inline-block rounded-md px-2.5 py-1 text-sm font-semibold'>
                        {t('{{amount}} USD credit', {
                          amount: formatNumber(plan.credit_usd, locale),
                        })}
                      </p>
                    </div>
                  ) : (
                    <p className='text-primary font-medium'>
                      {t('{{amount}} USD credit', {
                        amount: formatNumber(plan.credit_usd, locale),
                      })}
                    </p>
                  )}
                  <p className='text-muted-foreground text-xs'>
                    {t('Final credit includes any package bonus.')}
                  </p>
                </CardContent>
                <CardFooter className='mt-auto px-4'>
                  {canBuy ? (
                    <Button
                      className='w-full'
                      role='link'
                      render={
                        <a
                          href={plan.url}
                          target='_blank'
                          rel='noopener noreferrer'
                        />
                      }
                      aria-label={t('Buy package {{id}} on Catfk', {
                        id: plan.id,
                      })}
                    >
                      {t('Buy on Catfk')} <ExternalLink aria-hidden='true' />
                    </Button>
                  ) : (
                    <Button className='w-full' disabled>
                      {plan.status === 'available'
                        ? t('Purchases unavailable')
                        : statusLabel}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
      <div className='flex flex-wrap items-center gap-3'>
        <Button
          variant='secondary'
          disabled={!props.redemptionEnabled}
          onClick={() => {
            const input =
              document.querySelector<HTMLInputElement>('#redemption-code')
            input?.scrollIntoView({ block: 'center' })
            input?.focus({ preventScroll: true })
          }}
        >
          {t('I have a code — redeem now')}
        </Button>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Availability and stock are confirmed at Catfk checkout. Keep your order number and never share your code.'
          )}
        </p>
      </div>
    </TitledCard>
  )
}
