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
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { Main } from '@/components/layout/components/main'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  CheckoutDialog,
  ProductDialog,
} from '@/features/shop-preview/components/checkout'
import { Orders } from '@/features/shop-preview/components/orders'
import { Store } from '@/features/shop-preview/components/store'
import { productForPackage } from '@/features/shop-preview/lib/catalog'
import type { ShopProduct, ShopData } from '@/features/shop-preview/types'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import { buyProduct, loadShopProducts, loadShopOrders } from './api'

export function StorePage() {
  return (
    <ShopOwner
      orders={false}
      key={useAuthStore((s) => `${s.auth.user?.id}:${s.auth.session?.sid}`)}
    />
  )
}
export function ShopOrdersPage() {
  return (
    <ShopOwner
      orders
      key={useAuthStore((s) => `${s.auth.user?.id}:${s.auth.session?.sid}`)}
    />
  )
}
function ShopOwner(props: { orders: boolean }) {
  const { t } = useTranslation()
  const auth = useAuthStore((s) => s.auth)
  const navigate = useNavigate()
  const client = useQueryClient()
  const [product, setProduct] = useState<ShopProduct | null>(null)
  const [checkout, setCheckout] = useState<{
    product: ShopProduct
    packageId: string
    id: string
  } | null>(null)
  const catalog = useQuery({
    queryKey: ['shop', 'catalog', auth.user?.id, auth.session?.sid],
    queryFn: ({ signal }) => loadShopProducts(false, signal),
    gcTime: 0,
  })
  const orders = useInfiniteQuery({
    queryKey: ['shop', 'orders', auth.user?.id, auth.session?.sid],
    queryFn: ({ pageParam, signal }) =>
      loadShopOrders(false, pageParam, signal),
    initialPageParam: 1,
    enabled: props.orders,
    gcTime: 0,
    getNextPageParam: (page, pages) =>
      pages.flatMap((p) => p.items).length < page.total
        ? pages.length + 1
        : undefined,
  })
  if (catalog.isPending || (props.orders && orders.isPending)) {
    return (
      <Main>
        <LoadingState />
      </Main>
    )
  }
  if (catalog.isError || (props.orders && orders.isError)) {
    return (
      <Main>
        <ErrorState
          onRetry={() => {
            void catalog.refetch()
            if (props.orders) void orders.refetch()
          }}
        />
      </Main>
    )
  }
  const checkoutSelection = checkout
    ? productForPackage(checkout.product, checkout.packageId)
    : undefined
  const data: ShopData = {
    balanceCents: catalog.data.balanceCents,
    products: catalog.data.items,
    orders: orders.data?.pages.flatMap((p) => p.items) || [],
    inventory: [],
    codes: [],
    warehouse: [],
  }
  return (
    <Main>
      <div className='min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-7'>
        <div className='mx-auto w-full max-w-6xl space-y-5'>
          <div className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              onClick={() => void navigate({ to: '/store' })}
            >
              {t('Store')}
            </Button>
            <Button
              variant='outline'
              onClick={() => void navigate({ to: '/store/orders' })}
            >
              {t('My orders')}
            </Button>
            <Button
              variant='outline'
              onClick={() => void navigate({ to: '/warehouse' })}
            >
              {t('My warehouse')}
            </Button>
            <Button
              variant='outline'
              onClick={() => void navigate({ to: '/wallet' })}
            >
              {t('Wallet')}
            </Button>
          </div>
          {props.orders ? (
            <>
              <Orders
                orders={data.orders}
                onStore={() => void navigate({ to: '/store' })}
                onView={() => void navigate({ to: '/warehouse' })}
              />
              {orders.hasNextPage && (
                <Button
                  disabled={orders.isFetchingNextPage}
                  onClick={() => void orders.fetchNextPage()}
                >
                  {t('Load more')}
                </Button>
              )}
            </>
          ) : (
            <Store
              live
              data={data}
              onSelect={setProduct}
              onOrders={() => void navigate({ to: '/store/orders' })}
            />
          )}
        </div>
      </div>
      {product && (
        <ProductDialog
          live
          product={product}
          data={data}
          onClose={() => setProduct(null)}
          onBuy={(packageId) => {
            setCheckout({ product, packageId, id: crypto.randomUUID() })
            setProduct(null)
          }}
        />
      )}
      {checkout && checkoutSelection && (
        <CheckoutDialog
          product={checkoutSelection}
          balanceCents={data.balanceCents}
          onClose={() => setCheckout(null)}
          onConfirm={async () => {
            try {
              const selection = checkoutSelection
              const order = await buyProduct(
                checkout.product,
                checkout.packageId,
                checkout.id,
                selection.priceCents
              )
              setCheckout(null)
              await Promise.all([
                client.invalidateQueries({ queryKey: ['shop'] }),
                client.invalidateQueries({
                  queryKey: ['benefits', 'warehouse'],
                }),
                client.invalidateQueries({ queryKey: ['user', 'self'] }),
              ])
              toast.success(t('Purchase complete'))
              void navigate({
                to:
                  order.status === 'delivered' ? '/warehouse' : '/store/orders',
              })
            } catch (error) {
              handleServerError(error)
              void catalog.refetch()
            }
          }}
        />
      )}
    </Main>
  )
}
