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
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { Main } from '@/components/layout/components/main'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { useDebounce } from '@/hooks/use-debounce'
import { useAuthStore } from '@/stores/auth-store'

import { getBenefitWarehouse, getWarehouseDetail, redeemBenefit } from './api'
import { RedeemBenefitDialog } from './components/redeem-dialog'
import { Warehouse, WarehouseDetail } from './components/warehouse'

export function WarehousePage() {
  const auth = useAuthStore((state) => state.auth)
  return <WarehouseOwner key={`${auth.user?.id}:${auth.session?.sid}`} />
}

function WarehouseOwner() {
  const { t } = useTranslation()
  const auth = useAuthStore((state) => state.auth)
  const [redeeming, setRedeeming] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const keyword = useDebounce(search, 300)
  const navigate = useNavigate()
  const client = useQueryClient()
  const query = useInfiniteQuery({
    queryKey: [
      'benefits',
      'warehouse',
      auth.user?.id,
      auth.session?.sid,
      keyword,
      filter,
    ],
    enabled: !!auth.user,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      getBenefitWarehouse(pageParam, signal, false, keyword, filter),
    placeholderData: keepPreviousData,
    getNextPageParam: (page, pages) =>
      pages.flatMap((x) => x.items).length < page.total
        ? pages.length + 1
        : undefined,
    gcTime: 0,
  })
  const items = query.data?.pages.flatMap((x) => x.items) ?? []
  if (query.isPending && !search && filter === 'all') {
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
  return (
    <Main>
      <div className='min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-7'>
        <div className='mx-auto w-full max-w-6xl'>
          <Warehouse
            items={items}
            counts={query.data?.pages[0].counts}
            search={search}
            filter={filter}
            onSearch={setSearch}
            onFilter={setFilter}
            onStore={() => void navigate({ to: '/store' })}
            sourceLabel={(item) =>
              t(
                item.sourceCode.startsWith('shop:')
                  ? 'Store purchase'
                  : 'Code claim'
              )
            }
            hideAnnouncement
            onRedeem={() => setRedeeming(true)}
            onPopup={() => {}}
            onView={(item) => setSelected(item.id)}
          />
          {query.hasNextPage && (
            <div className='mt-4 text-center'>
              <Button
                variant='outline'
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {t('Load more')}
              </Button>
            </div>
          )}
        </div>
      </div>
      {redeeming && (
        <RedeemBenefitDialog
          onClose={() => setRedeeming(false)}
          onRedeem={async (code) => {
            const item = await redeemBenefit(code)
            await client.invalidateQueries({
              queryKey: ['benefits', 'warehouse'],
            })
            return item
          }}
          onWarehouse={() => {
            setRedeeming(false)
            void navigate({ to: '/warehouse' })
          }}
        />
      )}
      {selected && (
        <PrivateWarehouseDetail
          id={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </Main>
  )
}

function PrivateWarehouseDetail(props: { id: string; onClose: () => void }) {
  const { t } = useTranslation()
  const auth = useAuthStore((state) => state.auth)
  const query = useQuery({
    queryKey: [
      'benefits',
      'detail',
      auth.user?.id,
      auth.session?.sid,
      props.id,
    ],
    queryFn: ({ signal }) => getWarehouseDetail(props.id, signal),
    gcTime: 0,
    staleTime: 0,
  })
  if (query.data) {
    return <WarehouseDetail item={query.data} onClose={props.onClose} />
  }
  return (
    <Dialog
      open
      title={t('Delivery content')}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      {query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : (
        <LoadingState />
      )}
    </Dialog>
  )
}
