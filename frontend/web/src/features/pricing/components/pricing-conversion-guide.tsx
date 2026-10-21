/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Calculator } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card'
import { useStatus } from '@/hooks/use-status'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { useReferenceFX } from '../hooks/use-reference-fx'
import {
  formatPricingGuideContent,
  parsePricingGuideConfig,
  type PricingGuideConfig,
} from '../lib/guide-config'
import {
  STANDARD_CNY_PER_SITE_CREDIT,
  STANDARD_PACKAGE_CNY,
  STANDARD_PACKAGE_SITE_CREDITS,
  siteCreditUSDValue,
} from '../lib/standard-quote'
import { PricingModelNameGuide } from './pricing-model-name-guide'

export function PricingConversionGuide(
  props: { config?: PricingGuideConfig } = {}
) {
  const { t, i18n } = useTranslation()
  const { status } = useStatus()
  const config =
    props.config ?? parsePricingGuideConfig(status?.pricing_guide_config)
  const fx = useReferenceFX()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const cnyPerCredit = STANDARD_CNY_PER_SITE_CREDIT.toFixed(2)
  const cnyPerUsd = fx.rate.toFixed(4)
  const usdPerCredit = siteCreditUSDValue(fx.rate).toFixed(4)
  const title =
    config.conversionTitle.trim() || t('Model price conversion guide')
  const suffixTitle = config.suffixTitle.trim() || t('Model billing suffixes')
  const customContent = formatPricingGuideContent(config.conversionContent, {
    packagePrice: STANDARD_PACKAGE_CNY.toFixed(2),
    packageCredits: formatNumber(STANDARD_PACKAGE_SITE_CREDITS, locale),
    creditPrice: cnyPerCredit,
    exchangeRate: cnyPerUsd,
    usdPerCredit,
    fxDate: fx.date ?? t('Daily FX reference unavailable'),
  })

  if (!config.showConversion && !config.showSuffix) return null

  return (
    <Card
      role='region'
      aria-label={config.showConversion ? title : suffixTitle}
      data-card-hover='false'
      className='gap-3 border-sky-200/70 bg-sky-50/50 py-4 dark:border-sky-900/70 dark:bg-sky-950/20'
    >
      {config.showConversion && (
        <CardHeader className='gap-1'>
          <div className='flex items-center gap-2'>
            <Calculator aria-hidden='true' className='size-4 text-sky-600' />
            <h2 className='text-sm font-semibold'>{title}</h2>
          </div>
          {!customContent.trim() && (
            <CardDescription className='text-xs'>
              {t('Base package conversion basis', {
                price: STANDARD_PACKAGE_CNY.toFixed(2),
                credits: formatNumber(STANDARD_PACKAGE_SITE_CREDITS, locale),
              })}
            </CardDescription>
          )}
        </CardHeader>
      )}
      <CardContent className='space-y-2 text-sm'>
        {config.showConversion &&
          (customContent.trim() ? (
            <p className='text-muted-foreground text-xs leading-relaxed break-words whitespace-pre-wrap'>
              {customContent}
            </p>
          ) : (
            <>
              <div className='flex flex-wrap items-center gap-2 font-semibold tabular-nums'>
                <span>{t('1 site USD credit')}</span>
                <span aria-hidden='true' className='text-muted-foreground'>
                  ≈
                </span>
                <span>¥{cnyPerCredit}</span>
                <span aria-hidden='true' className='text-muted-foreground'>
                  ≈
                </span>
                <span>
                  ${usdPerCredit} {t('real USD equivalent')}
                </span>
              </div>
              <p className='text-muted-foreground text-xs leading-relaxed'>
                {t('Model price conversion formula', {
                  creditPrice: cnyPerCredit,
                  exchangeRate: cnyPerUsd,
                })}
              </p>
              <p className='text-muted-foreground text-xs leading-relaxed'>
                {fx.verified
                  ? t('Daily FX reference detail', { date: fx.date })
                  : t('Daily FX reference unavailable')}
              </p>
              <p className='text-muted-foreground text-xs leading-relaxed'>
                {t('Site credit and model token distinction')}
              </p>
            </>
          ))}
        {config.showSuffix && (
          <PricingModelNameGuide
            title={suffixTitle}
            content={config.suffixContent}
            separated={config.showConversion}
          />
        )}
      </CardContent>
    </Card>
  )
}
