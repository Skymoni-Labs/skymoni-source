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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { originalSaleModel } from '@/features/model-sales/original-price'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { DEFAULT_TOKEN_UNIT } from '../constants'
import { useBillingTime } from '../hooks/use-billing-time'
import {
  getDynamicDisplayGroupRatio,
  getDynamicPricingSummary,
  isUnconfiguredTaskUsageModel,
} from '../lib/dynamic-price'
import { isTokenBasedModel } from '../lib/model-helpers'
import { formatPrice, stripTrailingZeros } from '../lib/price'
import type { PricingModel } from '../types'
import type { ModelPriceCellOptions } from './model-price-cell'
import { SalePrice } from './sale-price'

export function CachedPriceCell(props: {
  model: PricingModel
  options: ModelPriceCellOptions
}) {
  const { t } = useTranslation()
  const {
    tokenUnit = DEFAULT_TOKEN_UNIT,
    priceRate = 1,
    usdExchangeRate = 1,
    showRechargePrice = false,
    selectedGroup,
  } = props.options

  const tokenUnitLabel = tokenUnit === 'K' ? '1K' : '1M'

  const model = props.model
  const currency = useSystemConfigStore((state) => state.config.currency)
  const billingTime = useBillingTime(model.billing_expr)
  const dynamicSummary = useMemo(
    () =>
      getDynamicPricingSummary(model, {
        now: billingTime === undefined ? undefined : new Date(billingTime),
        tokenUnit,
        showRechargePrice,
        priceRate,
        usdExchangeRate,
        groupRatioMultiplier: getDynamicDisplayGroupRatio(model, selectedGroup),
      }),
    // Currency is read indirectly by the price formatter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      model,
      tokenUnit,
      showRechargePrice,
      priceRate,
      usdExchangeRate,
      selectedGroup,
      billingTime,
      currency,
    ]
  )
  const original = useMemo(() => originalSaleModel(model), [model])
  const originalSummary = useMemo(
    () =>
      original
        ? getDynamicPricingSummary(original, {
            now: billingTime === undefined ? undefined : new Date(billingTime),
            tokenUnit,
            showRechargePrice,
            priceRate,
            usdExchangeRate,
            groupRatioMultiplier: getDynamicDisplayGroupRatio(
              original,
              selectedGroup
            ),
          })
        : undefined,
    [
      original,
      billingTime,
      tokenUnit,
      showRechargePrice,
      priceRate,
      usdExchangeRate,
      selectedGroup,
      currency,
    ]
  )

  if (dynamicSummary) {
    if (dynamicSummary.isSpecialExpression) {
      return (
        <span className='text-muted-foreground/50 text-xs'>
          {t('Special billing expression')}
        </span>
      )
    }

    const cacheEntries = dynamicSummary.entries.filter((entry) =>
      [
        'cacheReadPrice',
        'cacheCreatePrice',
        'cacheCreate1hPrice',
        'imageCachePrice',
      ].includes(entry.field)
    )
    if (!cacheEntries.length) {
      return <span className='text-muted-foreground/30 text-xs'>—</span>
    }

    return (
      <div className='max-w-full min-w-0'>
        {cacheEntries.map((entry) => {
          const before = originalSummary?.entries.find(
            (e) => e.key === entry.key && e.field === entry.field
          )
          return (
            <div
              key={entry.field}
              className='flex flex-wrap items-baseline gap-x-1'
            >
              <span className='text-muted-foreground text-xs'>
                {t(entry.shortLabel)}
              </span>
              <span className='font-mono text-sm tabular-nums'>
                <SalePrice
                  original={
                    before ? stripTrailingZeros(before.formatted) : undefined
                  }
                >
                  {stripTrailingZeros(entry.formatted)}
                </SalePrice>
              </span>
            </div>
          )
        })}
        <div className='text-muted-foreground/50 text-[10px]'>
          / {tokenUnitLabel}
        </div>
      </div>
    )
  }

  if (isUnconfiguredTaskUsageModel(model)) {
    return <span className='text-muted-foreground/30 text-xs'>—</span>
  }

  const isTokenBased = isTokenBasedModel(model)

  if (!isTokenBased || model.cache_ratio == null) {
    return <span className='text-muted-foreground/30 text-xs'>—</span>
  }

  const cachedPrice = stripTrailingZeros(
    formatPrice(
      model,
      'cache',
      tokenUnit,
      showRechargePrice,
      priceRate,
      usdExchangeRate,
      selectedGroup
    )
  )

  return (
    <div className='max-w-full min-w-0'>
      <span className='font-mono text-sm tabular-nums'>
        <SalePrice
          original={
            original
              ? stripTrailingZeros(
                  formatPrice(
                    original,
                    'cache',
                    tokenUnit,
                    showRechargePrice,
                    priceRate,
                    usdExchangeRate,
                    selectedGroup
                  )
                )
              : undefined
          }
        >
          {cachedPrice}
        </SalePrice>
      </span>
      <div className='text-muted-foreground/50 text-[10px]'>
        / {tokenUnitLabel}
      </div>
    </div>
  )
}
