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
  Archive,
  ShoppingBag,
  ReceiptText,
  Package,
  RotateCcw,
  FlaskConical,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  PopupBenefitLink,
  BenefitClaimPopup,
} from '@/features/benefits-preview/components/popup-link'
import { PreviewWallet } from '@/features/benefits-preview/components/wallet'
import { BenefitsAdmin } from '@/features/benefits/components/admin'
import { RedeemBenefitDialog } from '@/features/benefits/components/redeem-dialog'
import {
  Warehouse,
  WarehouseDetail,
} from '@/features/benefits/components/warehouse'
import type { WarehouseItem } from '@/features/benefits/types'
import { cn } from '@/lib/utils'

import { ShopAdmin } from './components/admin'
import {
  CheckoutDialog,
  ProductDialog,
  PurchaseSuccess,
} from './components/checkout'
import { Credit } from './components/credit'
import { Orders } from './components/orders'
import { ProductEditor } from './components/product-editor'
import { StockDialog } from './components/stock-dialog'
import { Store } from './components/store'
import {
  addSampleInventory,
  isProductOnSale,
  productForPackage,
} from './lib/catalog'
import { createShopData } from './lib/data'
import {
  deliverSampleOrder,
  purchaseSampleProduct,
  refundSampleOrder,
} from './lib/purchase'
import {
  addResourceCodes,
  importResourceInventory,
  redeemShopResource,
  resourceAdminData,
} from './lib/resources'
import type { ShopOrder, ShopProduct, ShopView } from './types'

export function ShopPreview() {
  const { t } = useTranslation()
  const [data, setData] = useState(createShopData)
  const [view, setView] = useState<ShopView>('store')
  const [product, setProduct] = useState<ShopProduct | null>(null)
  const [checkout, setCheckout] = useState<{
    productId: string
    packageId: string
    id: string
  } | null>(null)
  const [success, setSuccess] = useState<ShopOrder | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<ShopOrder | null>(null)
  const [selectedResource, setSelectedResource] =
    useState<WarehouseItem | null>(null)
  const [redeemCode, setRedeemCode] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState(false)
  const [adminTab, setAdminTab] = useState('products')
  const [linkedResource, setLinkedResource] = useState('muse::default')
  const adminData = resourceAdminData(data)
  const availableAnnouncement = data.codes.find(
    (code) =>
      code.code === 'SKY-MUSE-2026' &&
      code.enabled &&
      (!code.expires || code.expires >= '2026-10-05') &&
      (code.limit === 0 || code.claimed < code.limit) &&
      !data.warehouse.some(
        (item) => item.sourceCode === code.code && (item.userId || 1) === 1
      )
  )
  const redeem = (code: string) => {
    const result = redeemShopResource(data, code, '2026-10-05')
    if (!result.success) {
      toast.error(t(result.errorKey))
      return null
    }
    setData(result.data)
    return result.item
  }
  const addProduct = () => {
    const source = createShopData().products[0]
    const id = crypto.randomUUID()
    setEditorSection('basic')
    setEditor({
      ...source,
      id,
      onSale: false,
      featured: false,
      packages: [],
      defaultPackageName: t('Standard package'),
      content: '',
      benefit: {
        ...source.benefit,
        id,
        name: t('New account product'),
        enabled: true,
      },
    })
  }
  const [editor, setEditor] = useState<ShopProduct | null>(null)
  const [editorSection, setEditorSection] = useState<'basic' | 'content'>(
    'basic'
  )
  const [confirmation, setConfirmation] = useState<{
    type: 'reset' | 'refund' | 'deliver'
    id: string
  } | null>(null)
  const pages = [
    { id: 'store' as const, label: t('Store'), icon: ShoppingBag },
    { id: 'orders' as const, label: t('My orders'), icon: ReceiptText },
    { id: 'warehouse' as const, label: t('My warehouse'), icon: Archive },
    { id: 'wallet' as const, label: t('Wallet'), icon: Wallet },
    { id: 'admin' as const, label: t('Product management'), icon: Package },
  ]
  const [stockProduct, setStockProduct] = useState<ShopProduct | null>(null)
  const checkoutSource = data.products.find(
    (row) => row.id === checkout?.productId
  )
  const checkoutProduct =
    checkoutSource &&
    productForPackage(checkoutSource, checkout?.packageId || 'default')
  const purchase = () => {
    if (!checkout || !checkoutProduct) return
    const result = purchaseSampleProduct(
      data,
      checkoutProduct.id,
      checkout.id,
      '2026-10-05 09:30',
      checkout.packageId
    )
    if (!result.success) {
      toast.error(t(result.errorKey))
      return
    }
    setData(result.data)
    setCheckout(null)
    setSuccess(result.order)
  }
  const confirm = () => {
    if (!confirmation) return
    if (confirmation.type === 'reset') {
      setData(createShopData())
      setView('store')
    }
    if (confirmation.type === 'refund') {
      setData((previous) => refundSampleOrder(previous, confirmation.id))
      toast.success(t('Credit returned to your wallet'))
    }
    if (confirmation.type === 'deliver') {
      setData((previous) =>
        deliverSampleOrder(previous, confirmation.id, '2026-10-05 10:00')
      )
      toast.success(t('Order delivered'))
    }
    setConfirmation(null)
  }
  const confirmations = {
    reset: {
      title: t('Reset the preview?'),
      description: t(
        'This only restores fictional sample data in this preview.'
      ),
    },
    refund: {
      title: t('Cancel and refund this order?'),
      description: t(
        'Return the original paid credit and release the reserved stock.'
      ),
    },
    deliver: {
      title: t('Deliver this order?'),
      description: t(
        'Release the reserved sample account to the user warehouse.'
      ),
    },
  }
  return (
    <div className='text-foreground dark:bg-background min-h-dvh bg-[#fafafa]'>
      <header className='bg-background/95 sticky top-0 z-20 border-b backdrop-blur'>
        <div className='mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-8'>
          <div className='flex items-center gap-2.5'>
            <img
              src='/branding/skymoni-cloud-friend-transparent.png'
              alt=''
              className='size-8 object-contain'
            />
            <span className='text-xl font-semibold tracking-tight'>
              skymoni
              <span className='text-muted-foreground ml-2 hidden text-xs font-normal sm:inline'>
                {t('Store')}
              </span>
            </span>
          </div>
          <nav
            aria-label={t('Store navigation')}
            className='hidden items-center gap-1 md:flex'
          >
            {pages.map((page) => (
              <Button
                key={page.id}
                variant='ghost'
                aria-current={view === page.id ? 'page' : undefined}
                onClick={() => setView(page.id)}
                className={cn(
                  'rounded-lg text-sm font-normal',
                  view === page.id &&
                    'bg-slate-100 font-medium text-slate-950 dark:bg-slate-800 dark:text-slate-100',
                  page.id === 'admin' && 'ml-3 border-l'
                )}
              >
                <page.icon className='size-4' />
                {page.label}
              </Button>
            ))}
          </nav>
          <div className='flex items-center gap-2'>
            <Badge
              variant='outline'
              className='hidden rounded-md text-[10px] font-normal text-slate-500 xl:inline-flex'
            >
              <FlaskConical className='size-3' />
              {t('Local preview · no real deduction')}
            </Badge>
            <Button
              variant='ghost'
              size='icon'
              aria-label={t('Reset sample data')}
              onClick={() => setConfirmation({ type: 'reset', id: '' })}
            >
              <RotateCcw className='size-4' />
            </Button>
          </div>
        </div>
        <nav
          aria-label={t('Mobile store navigation')}
          className='flex justify-between gap-1 overflow-x-auto border-t px-2 py-2 md:hidden'
        >
          {pages.map((page) => (
            <Button
              key={page.id}
              variant={view === page.id ? 'secondary' : 'ghost'}
              size='sm'
              onClick={() => setView(page.id)}
              aria-current={view === page.id ? 'page' : undefined}
              className='shrink-0 gap-1.5 px-2 text-xs'
            >
              <page.icon className='size-3.5' />
              {page.label}
            </Button>
          ))}
        </nav>
      </header>
      <main className='mx-auto max-w-7xl px-4 py-6 sm:px-8'>
        {view === 'store' && (
          <Store
            data={data}
            onSelect={setProduct}
            onOrders={() => setView('orders')}
          />
        )}
        {view === 'orders' && (
          <Orders
            orders={data.orders}
            onStore={() => setView('store')}
            onView={setSelectedOrder}
          />
        )}
        {view === 'warehouse' && (
          <Warehouse
            items={data.warehouse.filter((item) => (item.userId || 1) === 1)}
            onRedeem={() => setRedeemCode('')}
            onStore={() => setView('store')}
            onPopup={() => setAnnouncement(true)}
            hideAnnouncement={!availableAnnouncement}
            onView={setSelectedResource}
            sourceLabel={(item) =>
              data.orders.some((order) => order.item.id === item.id)
                ? t('Store purchase')
                : t('Code redemption')
            }
          />
        )}
        {view === 'wallet' && (
          <PreviewWallet
            balanceDisplay={<Credit cents={data.balanceCents} />}
            onRedeem={setRedeemCode}
            onWarehouse={() => setView('warehouse')}
          />
        )}
        {view === 'admin' && (
          <Tabs
            value={adminTab}
            onValueChange={(value) => setAdminTab(String(value))}
            className='gap-6'
          >
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
              <TabsTrigger value='popup'>{t('Popup distribution')}</TabsTrigger>
            </TabsList>
            <TabsContent value='products'>
              <ShopAdmin
                data={data}
                onEdit={(p, section = 'basic') => {
                  setEditorSection(section)
                  setEditor(p)
                }}
                onStock={setStockProduct}
                onAdd={addProduct}
                onToggle={(id) =>
                  setData((previous) => ({
                    ...previous,
                    products: previous.products.map((row) =>
                      row.id === id
                        ? {
                            ...row,
                            onSale: !isProductOnSale(row),
                          }
                        : row
                    ),
                  }))
                }
                onDeliver={(order) =>
                  setConfirmation({ type: 'deliver', id: order.id })
                }
                onRefund={(order) =>
                  setConfirmation({ type: 'refund', id: order.id })
                }
              />
            </TabsContent>
            <TabsContent value='resources'>
              <BenefitsAdmin
                data={adminData}
                title={t('Inventory and codes')}
                description={t(
                  'Purchases and code claims share the selected package inventory.'
                )}
                initialTab='inventory'
                onSave={() => {}}
                onCreate={addProduct}
                onConfigure={(benefit) => {
                  const product = data.products.find(
                    (p) => p.id === benefit.id.split('::')[0]
                  )
                  if (product) {
                    setEditorSection('basic')
                    setEditor(product)
                  }
                }}
                onInventory={(items) =>
                  setData((previous) =>
                    importResourceInventory(previous, items)
                  )
                }
                onCodes={(codes) =>
                  setData((previous) => addResourceCodes(previous, codes))
                }
                onToggle={(id) =>
                  setData((previous) => ({
                    ...previous,
                    products: previous.products.map((p) =>
                      p.id === id.split('::')[0]
                        ? {
                            ...p,
                            benefit: {
                              ...p.benefit,
                              enabled: !p.benefit.enabled,
                            },
                          }
                        : p
                    ),
                  }))
                }
                onCodeToggle={async (code) => {
                  setData((previous) => ({
                    ...previous,
                    codes: previous.codes.map((c) =>
                      c.id === code.id ? { ...c, enabled: !c.enabled } : c
                    ),
                  }))
                }}
                onPopup={(id) => {
                  setLinkedResource(id)
                  setAdminTab('popup')
                }}
              />
            </TabsContent>
            <TabsContent value='popup'>
              <PopupBenefitLink
                data={adminData}
                benefitId={linkedResource}
                onBenefit={setLinkedResource}
                onRedeem={setRedeemCode}
              />
            </TabsContent>
          </Tabs>
        )}
        <p className='text-muted-foreground mt-6 text-center text-[10px]'>
          {t('Local preview · no real deduction')}
        </p>
      </main>
      {product && (
        <ProductDialog
          product={product}
          data={data}
          onClose={() => setProduct(null)}
          onBuy={(packageId) => {
            setCheckout({
              productId: product.id,
              packageId,
              id: crypto.randomUUID(),
            })
            setProduct(null)
          }}
        />
      )}
      {checkout && checkoutProduct && (
        <CheckoutDialog
          product={checkoutProduct}
          balanceCents={data.balanceCents}
          onClose={() => setCheckout(null)}
          onConfirm={purchase}
        />
      )}
      {success && (
        <PurchaseSuccess
          order={success}
          onClose={() => setSuccess(null)}
          onOrders={() => {
            setView('orders')
            setSuccess(null)
          }}
          onView={() => {
            setSelectedOrder(success)
            setSuccess(null)
          }}
        />
      )}
      {selectedOrder && selectedOrder.status === 'delivered' && (
        <WarehouseDetail
          item={selectedOrder.item}
          onClose={() => setSelectedOrder(null)}
        />
      )}
      {selectedResource && (
        <WarehouseDetail
          key={selectedResource.id}
          item={selectedResource}
          onClose={() => setSelectedResource(null)}
        />
      )}
      {redeemCode !== null && (
        <RedeemBenefitDialog
          initialCode={redeemCode}
          onClose={() => setRedeemCode(null)}
          onRedeem={redeem}
          onWarehouse={() => {
            setRedeemCode(null)
            setView('warehouse')
          }}
        />
      )}
      {announcement && (
        <BenefitClaimPopup
          title={t('A new resource is waiting for you')}
          content={t(
            'Claim a sample Muse account and keep it in My warehouse.'
          )}
          format='text'
          code='SKY-MUSE-2026'
          onClose={() => setAnnouncement(false)}
          onRedeem={setRedeemCode}
        />
      )}
      {stockProduct && (
        <StockDialog
          product={stockProduct}
          data={data}
          onClose={() => setStockProduct(null)}
          onAdd={(packageId, count) => {
            setData((previous) =>
              addSampleInventory(previous, stockProduct, packageId, count)
            )
            setStockProduct(null)
            toast.success(t('Sample inventory generated'))
          }}
        />
      )}
      {editor && (
        <ProductEditor
          key={editor.id}
          product={editor}
          initialSection={editorSection}
          onClose={() => setEditor(null)}
          onSave={(row) => {
            setData((previous) => ({
              ...previous,
              products: previous.products.some((item) => item.id === row.id)
                ? previous.products.map((item) =>
                    item.id === row.id ? row : item
                  )
                : [...previous.products, row],
            }))
            setEditor(null)
            toast.success(t('Product saved'))
          }}
        />
      )}
      {confirmation && (
        <ConfirmDialog
          open
          title={confirmations[confirmation.type].title}
          desc={confirmations[confirmation.type].description}
          onOpenChange={(open) => {
            if (!open) setConfirmation(null)
          }}
          handleConfirm={confirm}
        />
      )}
    </div>
  )
}
