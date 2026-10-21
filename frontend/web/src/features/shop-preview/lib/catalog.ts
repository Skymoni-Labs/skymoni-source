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
import type { ShopData, ShopPackage, ShopProduct } from '../types'

export function isProductOnSale(product: ShopProduct): boolean {
  return product.benefit.enabled && product.onSale !== false
}

export function getProductPackages(product: ShopProduct): ShopPackage[] {
  return [
    {
      id: 'default',
      name: product.defaultPackageName || 'Standard package',
      priceCents: product.priceCents,
      validityDays: product.benefit.validityDays,
      quotaGiB: product.quotaGiB,
      delivery: product.delivery,
    },
    ...(product.packages || []),
  ]
}

export function packageStock(
  data: ShopData,
  product: ShopProduct,
  packageId: string
): number {
  if (data.products && product.stockByPackage) {
    const stock = product.stockByPackage[packageId] ?? 0
    return stock < 0 ? Infinity : stock
  }
  if (product.benefit.stockMode === 'shared') return Infinity
  return data.inventory.filter(
    (item) =>
      item.benefitId === product.benefit.id &&
      (item.packageId || 'default') === packageId &&
      !item.claimed
  ).length
}

export function productForPackage(
  product: ShopProduct,
  packageId: string
): ShopProduct | undefined {
  const pack = getProductPackages(product).find((row) => row.id === packageId)
  if (!pack) return undefined
  return {
    ...product,
    priceCents: pack.priceCents,
    quotaGiB: pack.quotaGiB,
    delivery: pack.delivery,
    benefit: {
      ...product.benefit,
      validityDays: pack.validityDays,
      summary: product.generatedSales
        ? `${pack.quotaGiB} GiB · ${pack.validityDays} 天 · ${pack.priceCents / 100} 站内额度`
        : product.benefit.summary,
      name:
        packageId === 'default'
          ? product.benefit.name
          : `${product.benefit.name} · ${pack.name}`,
    },
  }
}

export function addSampleInventory(
  data: ShopData,
  product: ShopProduct,
  packageId: string,
  count: number
): ShopData {
  if (
    !getProductPackages(product).some((pack) => pack.id === packageId) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 100
  ) {
    return data
  }
  return {
    ...data,
    inventory: [
      ...data.inventory,
      ...Array.from({ length: count }, (_, i) => ({
        id: `shop-stock-${data.inventory.length + i + 1}`,
        benefitId: product.benefit.id,
        packageId,
        claimed: false,
        fields: product.benefit.fields.map((field) => {
          let value = `DEMO-${data.inventory.length + i + 1}`
          if (field.kind === 'link') value = 'https://example.com/digital-demo'
          else if (field.kind === 'secret') {
            value = `DEMO-only-${data.inventory.length + i + 1}`
          } else if (field.id === 'account') {
            value = `muse-demo-${data.inventory.length + i + 1}@example.com`
          }
          return { ...field, value }
        }),
      })),
    ],
  }
}
