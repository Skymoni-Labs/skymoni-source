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
import type {
  Benefit,
  BenefitCode,
  InventoryItem,
  WarehouseItem,
} from '@/features/benefits/types'

export type ShopPackage = {
  id: string
  name: string
  priceCents: number
  validityDays: number
  quotaGiB?: number
  delivery: 'instant' | 'manual'
}

export type ShopProduct = {
  id: string
  revision?: number
  quotaGiB?: number
  benefit: Benefit
  priceCents: number
  delivery: 'instant' | 'manual'
  featured: boolean
  cardSize?: 'normal' | 'large'
  sortOrder?: number
  resourceIds?: Record<string, string>
  stockByPackage?: Record<string, number>
  generatedSales?: boolean
  categoryLabel: string
  onSale?: boolean
  defaultPackageName?: string
  packages?: ShopPackage[]
  coverUrl?: string
  tags?: string
  content?: string
  contentFormat?: 'markdown' | 'html' | 'text'
  imagesEnabled?: boolean
  imageLayout?: 'landscape' | 'portrait'
  images?: string[]
  attributes?: { label: string; value: string }[]
}

export type ShopOrder = {
  userId?: number
  userName?: string
  receiptId?: string
  id: string
  checkoutId: string
  productId: string
  packageId?: string
  packageName?: string
  name: string
  priceCents: number
  inventoryId: string
  status: 'delivered' | 'pending' | 'refunded'
  refundReason?: string
  refundAt?: string
  refundActorId?: number
  refundCents?: number
  provisionState?: 'none' | 'pending' | 'ready' | 'needs_review'
  created: string
  item: WarehouseItem
}

export type ShopData = {
  balanceCents: number
  products: ShopProduct[]
  inventory: (InventoryItem & { packageId?: string })[]
  orders: ShopOrder[]
  codes: (BenefitCode & { packageId?: string })[]
  warehouse: WarehouseItem[]
}

export type ShopView = 'store' | 'orders' | 'warehouse' | 'wallet' | 'admin'
