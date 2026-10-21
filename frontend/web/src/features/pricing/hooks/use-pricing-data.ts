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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useStatus } from '@/hooks/use-status'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getPricing } from '../api'
import { getBillingModeLabelKey } from '../lib/billing-mode'
import { getVisiblePricingGroups } from '../lib/group-display'
import { parsePricingVisibleGroups } from '../lib/group-visibility'

export function usePricingData(enabled = true) {
  const { status } = useStatus()
  const { t } = useTranslation()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pricing'],
    queryFn: async () => requireServerSuccess(await getPricing()),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: 'always',
    enabled,
  })

  // Ensure rates never reach zero to prevent division errors
  const priceRate = useMemo(
    () => Math.max((status?.price as number) ?? 1, 0.001),
    [status?.price]
  )
  const usdExchangeRate = useMemo(
    () => Math.max((status?.usd_exchange_rate as number) ?? priceRate, 0.001),
    [status?.usd_exchange_rate, priceRate]
  )

  const selection = useMemo(
    () => parsePricingVisibleGroups(status?.pricing_visible_groups),
    [status?.pricing_visible_groups]
  )
  const catalogModels = useMemo(() => {
    if (!data?.data || !data?.vendors) return []

    const vendorMap = new Map(data.vendors.map((v) => [v.id, v]))

    return data.data.map((model) => {
      const vendor =
        (model.vendor_id ? vendorMap.get(model.vendor_id) : undefined) ??
        data.vendors.find((v) => Boolean(model.icon) && v.icon === model.icon)
      return {
        ...model,
        key: model.model_name,
        vendor_id: vendor?.id ?? model.vendor_id,
        icon: model.icon || vendor?.icon,
        description:
          model.description?.trim() ||
          t('Pricing model description fallback', {
            mode: t(getBillingModeLabelKey(model)),
          }),
        vendor_name: vendor?.name,
        vendor_icon: vendor?.icon,
        vendor_description: vendor?.description,
        group_ratio: data.group_ratio,
      }
    })
  }, [data, t])

  const visibleGroups = useMemo(
    () =>
      getVisiblePricingGroups(
        data?.usable_group ?? {},
        catalogModels,
        selection
      ),
    [data?.usable_group, catalogModels, selection]
  )
  const models = useMemo(() => {
    if (selection === null) return catalogModels
    const usableGroups = visibleGroups.filter((group) =>
      Object.hasOwn(data?.usable_group ?? {}, group)
    )
    return catalogModels.flatMap((model) => {
      const groups = model.enable_groups.includes('all')
        ? usableGroups
        : model.enable_groups.filter((group) => usableGroups.includes(group))
      return groups.length ? [{ ...model, enable_groups: groups }] : []
    })
  }, [catalogModels, selection, visibleGroups, data?.usable_group])

  return {
    models,
    visibleGroups,
    vendors: data?.vendors ?? [],
    groupRatio: data?.group_ratio ?? {},
    usableGroup: data?.usable_group ?? {},
    endpointMap: data?.supported_endpoint ?? {},
    autoGroups: data?.auto_groups ?? [],
    isLoading,
    error,
    refetch,
    priceRate,
    usdExchangeRate,
  }
}
