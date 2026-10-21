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
import type { BenefitPage } from '@/features/benefits/api'
import type { ShopProduct, ShopOrder } from '@/features/shop-preview/types'
import { api, getFreshAuthHeaders } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

export async function shopRequest<T>(
  path: string,
  body?: unknown,
  method: 'post' | 'put' = 'post',
  signal?: AbortSignal
): Promise<T> {
  const auth = useAuthStore.getState().auth
  const actor = `${auth.user?.id}:${auth.session?.sid}`
  const check = () => {
    const current = useAuthStore.getState().auth
    if (
      !auth.user ||
      signal?.aborted ||
      `${current.user?.id}:${current.session?.sid}` !== actor
    ) {
      throw new DOMException('Shop owner changed', 'AbortError')
    }
  }
  check()
  const headers = await getFreshAuthHeaders()
  check()
  const options = {
    headers:
      body instanceof FormData ? { ...headers, 'Content-Type': null } : headers,
    signal,
    disableDuplicate: true,
    skipErrorHandler: true,
    skipAuthRefresh: true,
  }
  const response =
    body === undefined
      ? await api.get<{ success: boolean; data: T; message?: string }>(
          `/api/shop${path}`,
          options
        )
      : await api[method]<{ success: boolean; data: T; message?: string }>(
          `/api/shop${path}`,
          body,
          options
        )
  check()
  return requireServerSuccess(response.data).data
}

export async function uploadProductImage(
  file: File,
  signal: AbortSignal
): Promise<string> {
  const body = new FormData()
  body.append('image', file)
  const result = await shopRequest<{ url: string }>(
    '/admin/images',
    body,
    'post',
    signal
  )
  return result.url
}
export interface ShopCatalogue extends BenefitPage<ShopProduct> {
  balanceCents: number
}

export async function loadPublicShopProducts(
  signal?: AbortSignal
): Promise<BenefitPage<ShopProduct>> {
  const first = await api.get<{
    success: boolean
    data: BenefitPage<ShopProduct>
  }>('/api/shop/public/products?p=1&page_size=100', {
    signal,
    skipAuthRefresh: true,
  })
  const page = requireServerSuccess(first.data).data
  const items = [...page.items]
  for (let number = 2; items.length < page.total; number++) {
    const response = await api.get<{
      success: boolean
      data: BenefitPage<ShopProduct>
    }>(`/api/shop/public/products?p=${number}&page_size=100`, {
      signal,
      skipAuthRefresh: true,
    })
    const next = requireServerSuccess(response.data).data
    if (!next.items.length) break
    items.push(...next.items)
  }
  return { ...page, items }
}
type OrderRecord = {
  id: number
  user_id: number
  checkout_id: string
  product_id: number
  package_id: string
  package_name: string
  name: string
  price_cents: number
  status: ShopOrder['status']
  created_at: number
  receipt_id: number
  user_name?: string
  refund_reason?: string
  refund_at?: number
  refund_actor_id?: number
  refund_cents?: number
  provision_state?: 'none' | 'pending' | 'ready' | 'needs_review'
}
export function mapShopOrder(row: OrderRecord): ShopOrder {
  return {
    id: String(row.id),
    userId: row.user_id,
    userName: row.user_name,
    checkoutId: row.checkout_id,
    productId: String(row.product_id),
    packageId: row.package_id,
    packageName: row.package_name,
    name: row.name,
    priceCents: row.price_cents,
    inventoryId: '',
    status: row.status,
    refundReason: row.refund_reason,
    refundAt: row.refund_at
      ? new Date(row.refund_at * 1000).toISOString()
      : undefined,
    refundActorId: row.refund_actor_id,
    refundCents: row.refund_cents,
    provisionState: row.provision_state,
    created: new Date(row.created_at * 1000).toISOString(),
    receiptId: row.receipt_id ? String(row.receipt_id) : undefined,
    item: {
      id: String(row.receipt_id),
      received: new Date(row.created_at * 1000).toISOString(),
      expires: '',
      status: 'active',
      sourceCode: `shop:${row.id}`,
      fields: [],
      benefit: {
        id: '',
        name: row.name,
        summary: '',
        category: 'custom',
        tone: 'sky',
        format: 'markdown',
        instructions: '',
        fields: [],
        stockMode: 'individual',
        validityDays: 0,
        enabled: true,
      },
    },
  }
}
export async function loadShopProducts(
  admin: boolean,
  signal?: AbortSignal
): Promise<ShopCatalogue> {
  const first = await shopRequest<ShopCatalogue>(
    `/products?admin=${admin ? 1 : 0}&p=1&page_size=100`,
    undefined,
    'post',
    signal
  )
  const items = [...first.items]
  for (let page = 2; items.length < first.total; page++) {
    const next = await shopRequest<ShopCatalogue>(
      `/products?admin=${admin ? 1 : 0}&p=${page}&page_size=100`,
      undefined,
      'post',
      signal
    )
    if (!next.items.length) break
    items.push(...next.items)
  }
  return { ...first, items }
}
export async function loadShopOrders(
  admin: boolean,
  page: number,
  signal?: AbortSignal,
  filters?: { status?: string; query?: string }
) {
  const params = new URLSearchParams({
    admin: admin ? '1' : '0',
    p: String(page),
  })
  if (admin && filters?.status && filters.status !== 'all') {
    params.set('status', filters.status)
  }
  if (admin && filters?.query) {
    params.set('q', filters.query)
  }
  const result = await shopRequest<BenefitPage<OrderRecord>>(
    `/orders?${params}`,
    undefined,
    'post',
    signal
  )
  return { ...result, items: result.items.map(mapShopOrder) }
}
export async function buyProduct(
  product: ShopProduct,
  packageId: string,
  checkoutId: string,
  priceCents: number
) {
  return mapShopOrder(
    await shopRequest<OrderRecord>('/purchase', {
      product_id: Number(product.id),
      package_id: packageId,
      checkout_id: checkoutId,
      price_cents: priceCents,
    })
  )
}
export async function saveProduct(product: ShopProduct) {
  return shopRequest<ShopProduct>(
    product.id ? `/admin/products/${product.id}` : '/admin/products',
    product,
    product.id ? 'put' : 'post'
  )
}
export async function settleOrder(
  order: ShopOrder,
  action: 'deliver' | 'refund',
  reason = '管理员取消待交付订单'
) {
  return shopRequest(
    `/admin/orders/${order.id}/${action}`,
    action === 'refund' ? { reason } : {}
  )
}

export async function getShopRefundQuote(orderId: string, signal?: AbortSignal) {
  return shopRequest<{ refundCents: number; refundQuota: number; priceCents: number }>(
    `/admin/orders/${orderId}/refund-quote`, undefined, 'post', signal
  )
}
