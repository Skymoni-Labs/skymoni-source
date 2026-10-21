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
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { Main } from '@/components/layout/components/main'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { uploadProductImage } from '@/features/shop/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import {
  generateBenefitCodes,
  getBenefitDetail,
  getBenefitWarehouse,
  importBenefitInventory,
  listBenefitCodes,
  listBenefitInventory,
  listBenefits,
  saveBenefit,
  setBenefitCodeState,
  setBenefitState,
} from './api'
import { BenefitsAdmin } from './components/admin'

export function BenefitsAdminPage() {
  const auth = useAuthStore((state) => state.auth)
  return <BenefitsAdministrator key={`${auth.user?.id}:${auth.session?.sid}`} />
}

function BenefitsAdministrator() {
  const { t } = useTranslation()
  const auth = useAuthStore((state) => state.auth)
  const navigate = useNavigate()
  const client = useQueryClient()
  const query = useInfiniteQuery({
    queryKey: ['benefits', 'admin', auth.user?.id, auth.session?.sid],
    enabled: auth.user?.role === ROLE.SUPER_ADMIN,
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      const [benefits, inventory, codes, warehouse] = await Promise.all([
        listBenefits(pageParam, signal),
        listBenefitInventory(pageParam, signal),
        listBenefitCodes(pageParam, signal),
        getBenefitWarehouse(pageParam, signal, true),
      ])
      return { benefits, inventory, codes, warehouse }
    },
    getNextPageParam: (page, pages) =>
      Object.values(page).some((part) => pages.length * 50 < part.total)
        ? pages.length + 1
        : undefined,
    gcTime: 0,
  })
  const refresh = () => client.invalidateQueries({ queryKey: ['benefits'] })
  if (auth.user?.role !== ROLE.SUPER_ADMIN) {
    return (
      <Main>
        <ErrorState title={t('Access denied')} />
      </Main>
    )
  }
  if (query.isPending) {
    return (
      <Main>
        <LoadingState />
      </Main>
    )
  }
  if (query.isError) {
    return (
      <Main>
        <ErrorState onRetry={() => void query.refetch()} />
      </Main>
    )
  }
  const pages = query.data.pages
  const data = {
    inventoryCounts: pages[0].inventory.counts,
    benefits: pages.flatMap((x) => x.benefits.items),
    inventory: pages.flatMap((x) => x.inventory.items),
    codes: pages.flatMap((x) => x.codes.items),
    warehouse: pages.flatMap((x) => x.warehouse.items),
  }
  return (
    <Main>
      <BenefitsAdmin
        live
        data={data}
        onEdit={getBenefitDetail}
        onUploadImage={uploadProductImage}
        onSave={async (benefit) => {
          await saveBenefit(
            benefit,
            data.benefits.some((x) => x.id === benefit.id)
          )
          await refresh()
          toast.success(t('Benefit saved'))
        }}
        onInventory={async (items) => {
          await importBenefitInventory(items)
          await refresh()
        }}
        onCodes={async (codes) => {
          await generateBenefitCodes(codes)
          await refresh()
        }}
        onToggle={async (id) => {
          await setBenefitState(
            id,
            !data.benefits.find((x) => x.id === id)?.enabled
          )
          await refresh()
        }}
        onCodeToggle={async (code) => {
          await setBenefitCodeState(code.id, !code.enabled)
          await refresh()
        }}
        onPopup={() => {
          toast.info(t('Select a benefit code in the popup editor'))
          void navigate({ to: '/popup-notices' })
        }}
      />
      {query.hasNextPage && (
        <div className='mt-4 text-center'>
          <p className='text-muted-foreground mb-2 text-xs'>
            {t(
              'Counts reflect loaded records. Load more to view older records.'
            )}
          </p>
          <Button
            variant='outline'
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {t('Load more')}
          </Button>
        </div>
      )}
    </Main>
  )
}
