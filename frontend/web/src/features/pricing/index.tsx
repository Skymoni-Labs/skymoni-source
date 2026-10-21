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
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'
import { Button } from '@/components/ui/button'
import { PricingSaleBanner } from '@/features/model-sales/pricing-promotion'
import { useAuthStore } from '@/stores/auth-store'

import { ClassicPricing } from './classic-pricing'
import { LoadingSkeleton, ModelDetailsDrawer } from './components'
import { PricingConversionGuide } from './components/pricing-conversion-guide'
import { PricingMatrix } from './components/pricing-matrix'
import { UserModelGroupsSection } from './components/user-model-groups-section'
import { usePricingData } from './hooks/use-pricing-data'
import { useUserModelGroups } from './user-model-groups-api'

export function Pricing() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'classic' | 'ratio'>('ratio')
  const modeSwitcher = (
    <div
      className='bg-background inline-flex gap-1 rounded-lg border p-1'
      role='group'
      aria-label={t('Model display mode')}
    >
      <Button
        size='sm'
        variant={mode === 'ratio' ? 'default' : 'ghost'}
        aria-pressed={mode === 'ratio'}
        onClick={() => setMode('ratio')}
      >
        {t('Multiplier table')}
      </Button>
      <Button
        size='sm'
        variant={mode === 'classic' ? 'default' : 'ghost'}
        aria-pressed={mode === 'classic'}
        onClick={() => setMode('classic')}
      >
        {t('Classic model view')}
      </Button>
    </div>
  )
  return mode === 'classic' ? (
    <ClassicPricing modeSwitcher={modeSwitcher} />
  ) : (
    <RatioPricing modeSwitcher={modeSwitcher} />
  )
}

function RatioPricing({ modeSwitcher }: { modeSwitcher: ReactNode }) {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const personalGroupsQuery = useUserModelGroups(Boolean(userId))
  const [personalGroupId, setPersonalGroupId] = useState<number | null>(null)
  const [selectedModelName, setSelectedModelName] = useState<string | null>(
    null
  )
  const [search, setSearch] = useState('')
  const [vendor, setVendor] = useState('all')
  const [group, setGroup] = useState('all')
  const {
    models,
    visibleGroups: groups,
    vendors,
    groupRatio,
    usableGroup,
    endpointMap,
    autoGroups,
    isLoading,
    priceRate,
    usdExchangeRate,
  } = usePricingData()
  const selectedGroup = groups.includes(group) ? group : 'all'
  const personalGroups = personalGroupsQuery.data ?? []
  const visibleModels = useMemo(() => {
    const personal = personalGroupsQuery.data?.find(
      (g) => g.id === personalGroupId
    )
    return (models ?? []).filter(
      (m) =>
        (vendor === 'all' || String(m.vendor_id) === vendor) &&
        (selectedGroup === 'all' || m.enable_groups.includes(selectedGroup)) &&
        (!personal || personal.model_names.includes(m.model_name)) &&
        m.model_name.toLowerCase().includes(search.trim().toLowerCase())
    )
  }, [
    models,
    vendor,
    selectedGroup,
    search,
    personalGroupId,
    personalGroupsQuery.data,
  ])
  const selectedModel = models?.find((m) => m.model_name === selectedModelName)
  return (
    <PublicLayout showMainContainer={false}>
      <PageTransition className='to-background mx-auto min-h-screen w-full max-w-[1800px] bg-gradient-to-b from-teal-50/60 px-3 pt-24 pb-10 sm:px-6 dark:from-teal-950/20'>
        <div className='mb-5 flex justify-center'>{modeSwitcher}</div>
        <PricingSaleBanner />
        <header className='mb-6'>
          <h1 className='text-2xl font-semibold'>{t('Model Square')}</h1>
          <p className='text-muted-foreground mt-2 text-sm'>
            {t('This site currently has {{count}} models enabled', {
              count: models?.length ?? 0,
            })}
          </p>
        </header>
        <div className='mb-5'>
          <PricingConversionGuide />
        </div>
        {isLoading ? (
          <LoadingSkeleton viewMode='table' />
        ) : (
          <PricingMatrix
            models={visibleModels}
            vendors={vendors ?? []}
            groups={groups}
            vendor={vendor}
            group={selectedGroup}
            onVendor={setVendor}
            onGroup={setGroup}
            search={search}
            onSearch={setSearch}
            onClear={() => setSearch('')}
            onModelClick={setSelectedModelName}
            personalGroups={
              userId ? (
                <UserModelGroupsSection
                  defaultOpen={false}
                  groups={personalGroups}
                  selectedId={personalGroupId}
                  onSelect={setPersonalGroupId}
                  models={models ?? []}
                />
              ) : undefined
            }
          />
        )}
        {selectedModel && (
          <ModelDetailsDrawer
            open={Boolean(selectedModel)}
            onOpenChange={(open) => {
              if (!open) setSelectedModelName(null)
            }}
            model={selectedModel}
            groupRatio={groupRatio || {}}
            usableGroup={usableGroup || {}}
            endpointMap={
              (endpointMap as Record<
                string,
                { path?: string; method?: string }
              >) || {}
            }
            autoGroups={autoGroups || []}
            priceRate={priceRate ?? 1}
            usdExchangeRate={usdExchangeRate ?? 1}
            tokenUnit='M'
            showRechargePrice={false}
          />
        )}
      </PageTransition>
    </PublicLayout>
  )
}
