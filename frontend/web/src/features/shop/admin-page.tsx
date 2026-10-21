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

import { ConfirmDialog } from '@/components/confirm-dialog'
import { ErrorState } from '@/components/error-state'
import { Main } from '@/components/layout/components/main'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  getBenefitDetail,
  listBenefits,
  listBenefitInventory,
  listBenefitCodes,
  getBenefitWarehouse,
  saveBenefit,
  importBenefitInventory,
  generateBenefitCodes,
  setBenefitState,
  setBenefitCodeState,
} from '@/features/benefits/api'
import { BenefitsAdmin } from '@/features/benefits/components/admin'
import { ShopAdmin } from '@/features/shop-preview/components/admin'
import { ProductEditor } from '@/features/shop-preview/components/product-editor'
import type {
  ShopProduct,
  ShopOrder,
  ShopData,
} from '@/features/shop-preview/types'
import { handleServerError } from '@/lib/handle-server-error'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import {
  loadShopProducts,
  loadShopOrders,
  saveProduct,
  shopRequest,
  settleOrder,
  uploadProductImage,
} from './api'
import { ShopAfterSales } from './components/after-sales'
import { DripQuantityDialog } from './components/drip-quantity-dialog'
import { ShopRefundDialog } from './components/refund-dialog'

function newProduct(): ShopProduct {
  return {
    id: '',
    benefit: {
      id: '',
      name: '',
      summary: '',
      category: 'account',
      tone: 'sky',
      format: 'markdown',
      instructions: '',
      fields: [
        { id: 'account', label: '账号', kind: 'text', value: '' },
        { id: 'password', label: '密码', kind: 'secret', value: '' },
      ],
      stockMode: 'individual',
      validityDays: 30,
      enabled: true,
    },
    priceCents: 100,
    delivery: 'instant',
    featured: false,
    cardSize: 'normal',
    sortOrder: 0,
    categoryLabel: '账号',
    onSale: false,
    contentFormat: 'markdown',
    defaultPackageName: '标准套餐',
  }
}
export function ShopAdminPage() {
  return (
    <ShopAdministrator
      key={useAuthStore((s) => `${s.auth.user?.id}:${s.auth.session?.sid}`)}
    />
  )
}
function ShopAdministrator() {
  const { t } = useTranslation()
  const auth = useAuthStore((s) => s.auth)
  const navigate = useNavigate()
  const client = useQueryClient()
  const [tab, setTab] = useState('products')
  const [orderStatus, setOrderStatus] = useState<
    'all' | 'pending' | 'delivered' | 'refunded'
  >('all')
  const [orderQuery, setOrderQuery] = useState('')
  const [orderPage, setOrderPage] = useState(1)
  const [editor, setEditor] = useState<ShopProduct | null>(null)
  const [quantityProduct, setQuantityProduct] = useState<ShopProduct | null>(
    null
  )
  const [editorSection, setEditorSection] = useState<'basic' | 'content'>(
    'basic'
  )
  const [confirm, setConfirm] = useState<{
    order: ShopOrder
    action: 'deliver' | 'refund'
  } | null>(null)
  const catalogue = useQuery({
    queryKey: ['shop', 'admin', auth.user?.id, auth.session?.sid],
    queryFn: ({ signal }) => loadShopProducts(true, signal),
    enabled: auth.user?.role === ROLE.SUPER_ADMIN,
    gcTime: 0,
  })
  const resources = useInfiniteQuery({
    queryKey: ['benefits', 'shop-admin', auth.user?.id, auth.session?.sid],
    enabled: auth.user?.role === ROLE.SUPER_ADMIN,
    initialPageParam: 1,
    gcTime: 0,
    queryFn: async ({ pageParam, signal }) => {
      const [benefits, inventory, codes, warehouse, orders] = await Promise.all(
        [
          listBenefits(pageParam, signal),
          listBenefitInventory(pageParam, signal),
          listBenefitCodes(pageParam, signal),
          getBenefitWarehouse(pageParam, signal, true),
          loadShopOrders(true, pageParam, signal),
        ]
      )
      return { benefits, inventory, codes, warehouse, orders }
    },
    getNextPageParam: (p, pages) =>
      Object.values(p).some((x) => pages.length * 50 < x.total)
        ? pages.length + 1
        : undefined,
  })
  const afterSales = useQuery({
    queryKey: [
      'shop',
      'after-sales',
      auth.user?.id,
      auth.session?.sid,
      orderStatus,
      orderQuery,
      orderPage,
    ],
    enabled: auth.user?.role === ROLE.SUPER_ADMIN && tab === 'orders',
    gcTime: 0,
    queryFn: ({ signal }) =>
      loadShopOrders(true, orderPage, signal, {
        status: orderStatus,
        query: orderQuery,
      }),
  })
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['shop'] }),
      client.invalidateQueries({ queryKey: ['benefits'] }),
    ])
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action()
      await refresh()
    } catch (e) {
      handleServerError(e)
    }
  }
  if (auth.user?.role !== ROLE.SUPER_ADMIN) {
    return (
      <Main>
        <ErrorState title={t('Access denied')} />
      </Main>
    )
  }
  if (catalogue.isPending || resources.isPending) {
    return (
      <Main>
        <LoadingState />
      </Main>
    )
  }
  if (catalogue.isError || resources.isError) {
    return (
      <Main>
        <ErrorState
          onRetry={() => {
            void catalogue.refetch()
            void resources.refetch()
          }}
        />
      </Main>
    )
  }
  const pages = resources.data.pages
  const generatedResourceIds = new Set(
    catalogue.data.items
      .filter((product) => product.generatedSales)
      .flatMap((product) => Object.values(product.resourceIds || {}))
  )
  const resourceData = {
    inventoryCounts: pages[0].inventory.counts,
    benefits: pages
      .flatMap((p) => p.benefits.items)
      .filter((item) => !generatedResourceIds.has(item.id)),
    inventory: pages
      .flatMap((p) => p.inventory.items)
      .filter((item) => !generatedResourceIds.has(item.benefitId)),
    codes: pages
      .flatMap((p) => p.codes.items)
      .filter((item) => !generatedResourceIds.has(item.benefitId)),
    warehouse: pages.flatMap((p) => p.warehouse.items),
  }
  const data: ShopData = {
    balanceCents: catalogue.data.balanceCents,
    products: catalogue.data.items,
    orders: pages.flatMap((p) => p.orders.items),
    ...resourceData,
  }
  const edit = async (
    p: ShopProduct,
    section: 'basic' | 'content' = 'basic'
  ) => {
    try {
      const benefit = await getBenefitDetail(p.benefit.id)
      setEditorSection(section)
      setEditor({ ...p, benefit })
    } catch (e) {
      handleServerError(e)
    }
  }
  let ordersPanel = <LoadingState />
  if (afterSales.isError) {
    ordersPanel = <ErrorState onRetry={() => void afterSales.refetch()} />
  } else if (!afterSales.isPending) {
    ordersPanel = (
      <ShopAfterSales
        orders={afterSales.data?.items || []}
        total={afterSales.data?.total || 0}
        page={orderPage}
        status={orderStatus}
        query={orderQuery}
        loading={afterSales.isFetching}
        onStatusChange={(value) => {
          setOrderStatus(value)
          setOrderPage(1)
        }}
        onQueryChange={(value) => {
          setOrderQuery(value)
          setOrderPage(1)
        }}
        onPageChange={setOrderPage}
        onRefund={(order) => {
          setConfirm({ order, action: 'refund' })
        }}
        onDeliver={(order) => setConfirm({ order, action: 'deliver' })}
      />
    )
  }
  return (
    <Main>
      <div className='min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-7'>
        <div className='mx-auto w-full max-w-6xl'>
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <TabsList
              aria-label={t('Commerce management sections')}
              className='max-w-full overflow-x-auto'
            >
              <TabsTrigger value='products'>
                {t('Product configuration')}
              </TabsTrigger>
              <TabsTrigger value='resources'>
                {t('Inventory and codes')}
              </TabsTrigger>
              <TabsTrigger value='orders'>
                {t('Orders and after-sales')}
              </TabsTrigger>
              <TabsTrigger value='popup'>{t('Popup distribution')}</TabsTrigger>
            </TabsList>
            <TabsContent value='products'>
              <ShopAdmin
                live
                data={data}
                onAdd={() => {
                  setEditorSection('basic')
                  setEditor(newProduct())
                }}
                onEdit={(p, section) => void edit(p, section)}
                onStock={(product) => {
                  if (product.id === '3') setQuantityProduct(product)
                  else setTab('resources')
                }}
                onToggle={(id) =>
                  void run(() =>
                    shopRequest(`/admin/products/${id}/sale`, {
                      on_sale: !data.products.find((p) => p.id === id)?.onSale,
                    })
                  )
                }
                onDeliver={(order) => setConfirm({ order, action: 'deliver' })}
                onRefund={(order) => {
                  setConfirm({ order, action: 'refund' })
                }}
              />
            </TabsContent>
            <TabsContent value='resources'>
              <BenefitsAdmin
                live
                title={t('Inventory and codes')}
                description={t(
                  'Stock and redemption codes share the same encrypted delivery inventory.'
                )}
                data={resourceData}
                onCreate={() => {
                  setEditorSection('basic')
                  setEditor(newProduct())
                }}
                onConfigure={(b) => {
                  const product = data.products.find((p) =>
                    Object.values(p.resourceIds || {}).includes(b.id)
                  )
                  if (product) void edit(product)
                  else {
                    setEditorSection('basic')
                    void getBenefitDetail(b.id)
                      .then((benefit) =>
                        setEditor({
                          ...newProduct(),
                          benefit,
                          categoryLabel: t('Digital resources'),
                        })
                      )
                      .catch(handleServerError)
                  }
                }}
                onEdit={getBenefitDetail}
                onUploadImage={uploadProductImage}
                onSave={async (b) => {
                  await saveBenefit(
                    b,
                    resourceData.benefits.some((x) => x.id === b.id)
                  )
                  await refresh()
                }}
                onInventory={async (items) => {
                  await importBenefitInventory(items)
                  await refresh()
                }}
                onCodes={async (codes) => {
                  await generateBenefitCodes(codes)
                  await refresh()
                }}
                onToggle={(id) =>
                  run(() =>
                    setBenefitState(
                      id,
                      !resourceData.benefits.find((b) => b.id === id)?.enabled
                    )
                  )
                }
                onCodeToggle={(code) =>
                  run(() => setBenefitCodeState(code.id, !code.enabled)).then(
                    () => {}
                  )
                }
                onPopup={() =>
                  void navigate({
                    to: '/popup-notices',
                  })
                }
              />
            </TabsContent>
            <TabsContent value='orders'>{ordersPanel}</TabsContent>
            <TabsContent value='popup'>
              <div className='space-y-4 rounded-xl border p-6'>
                <h2 className='text-xl font-semibold'>
                  {t('Popup distribution')}
                </h2>
                <p className='text-muted-foreground text-sm'>
                  {t(
                    'Use existing popup notices to distribute a resource code. Claims appear in My warehouse.'
                  )}
                </p>
                <Button onClick={() => void navigate({ to: '/popup-notices' })}>
                  {t('Manage popup notifications')}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
          {tab !== 'orders' && resources.hasNextPage && (
            <Button
              className='mt-5'
              disabled={resources.isFetchingNextPage}
              onClick={() => void resources.fetchNextPage()}
            >
              {t('Load more')}
            </Button>
          )}
        </div>
      </div>
      {editor && (
        <ProductEditor
          live
          onUploadImage={uploadProductImage}
          product={editor}
          initialSection={editorSection}
          onClose={() => setEditor(null)}
          onSave={async (p) => {
            try {
              await saveProduct(p)
              setEditor(null)
              await refresh()
            } catch (e) {
              handleServerError(e)
            }
          }}
        />
      )}
      {quantityProduct && (
        <DripQuantityDialog
          key={quantityProduct.id}
          product={quantityProduct}
          onClose={() => setQuantityProduct(null)}
          onSave={async (remaining) => {
            await shopRequest(
              `/admin/products/${quantityProduct.id}/drip-quantity`,
              { remaining },
              'put'
            )
            setQuantityProduct(null)
            await refresh()
          }}
        />
      )}
      {confirm?.action === 'deliver' && (
        <ConfirmDialog
          open
          title={t('Confirm delivery')}
          desc={t('Deliver the reserved resource to the customer warehouse?')}
          confirmText={t('Confirm')}
          onOpenChange={(open) => {
            if (!open) setConfirm(null)
          }}
          handleConfirm={async () => {
            try {
              await settleOrder(confirm.order, 'deliver')
              setConfirm(null)
              await refresh()
            } catch (e) {
              handleServerError(e)
            }
          }}
        />
      )}
      {confirm?.action === 'refund' && (
        <ShopRefundDialog
          key={confirm.order.id}
          order={confirm.order}
          onClose={() => setConfirm(null)}
          onRefund={async (reason) => {
            await settleOrder(confirm.order, 'refund', reason)
            setConfirm(null)
            await refresh()
          }}
        />
      )}
    </Main>
  )
}
