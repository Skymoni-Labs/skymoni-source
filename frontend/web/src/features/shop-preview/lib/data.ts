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
import { createPreviewData } from '@/features/benefits-preview/lib/seed'

import type { ShopData } from '../types'

// Fictional accounts and prices for the local preview only.
export function createShopData(): ShopData {
  const sample = createPreviewData()
  const muse = structuredClone(sample.benefits[0])
  muse.name = 'Muse 创作账号'
  muse.summary = '独立账号与使用说明。支持选择套餐，付款后自动领取。'
  const manual = structuredClone(muse)
  manual.id = 'muse-manual'
  manual.name = 'Muse 定制账号'
  manual.summary = '适合需要人工安排的账号，付款后由管理员完成交付。'
  manual.tone = 'sky'
  const license = structuredClone(sample.benefits[2])
  license.name = '创作工具体验码'
  license.instructions = license.instructions.replaceAll('福利', '资源')
  license.enabled = true
  return {
    balanceCents: 39900,
    products: [
      {
        id: 'muse',
        cardSize: 'large',
        sortOrder: 0,
        benefit: muse,
        priceCents: 9900,
        delivery: 'instant',
        featured: true,
        categoryLabel: '账号',
        defaultPackageName: '标准 · 30 天',
        packages: [
          {
            id: 'extended',
            name: '扩展 · 90 天',
            priceCents: 24900,
            validityDays: 90,
            delivery: 'instant',
          },
        ],
        contentFormat: 'markdown',
        content:
          '## Muse 创作账号\n选择适合自己的套餐，使用站内额度购买。\n\n- 独立交付一份账号\n- 账号与说明保存到我的仓库\n- 有效期从交付完成开始计算\n\n> 以上均为虚构示例权益，正式权益由管理员配置。',
      },
      {
        id: 'muse-manual',
        benefit: manual,
        priceCents: 14900,
        delivery: 'manual',
        featured: false,
        categoryLabel: '账号',
      },
      {
        id: 'license',
        benefit: license,
        priceCents: 4900,
        delivery: 'instant',
        featured: false,
        categoryLabel: '激活码',
      },
      {
        id: 'design',
        benefit: structuredClone(sample.benefits[1]),
        priceCents: 2900,
        delivery: 'instant',
        featured: false,
        categoryLabel: '素材资源',
        onSale: false,
      },
    ],
    inventory: [
      ...sample.inventory,
      ...sample.inventory.slice(0, 4).map((item, index) => ({
        ...structuredClone(item),
        id: `extended-stock-${index + 1}`,
        packageId: 'extended',
        fields: item.fields.map((field) =>
          field.id === 'account'
            ? { ...field, value: `muse-extended-demo-${index + 1}@example.com` }
            : { ...field }
        ),
      })),
      ...sample.inventory.slice(0, 3).map((item, index) => ({
        ...structuredClone(item),
        id: `manual-stock-${index + 1}`,
        benefitId: manual.id,
        fields: item.fields.map((field) =>
          field.id === 'account'
            ? { ...field, value: `muse-custom-demo-${index + 1}@example.com` }
            : { ...field }
        ),
      })),
    ],
    orders: [],
    codes: structuredClone(sample.codes),
    warehouse: sample.warehouse.map((item) => ({
      ...structuredClone(item),
      userId: 1,
      benefit: {
        ...structuredClone(item.benefit),
        instructions: item.benefit.instructions.replaceAll('福利', '资源'),
      },
    })),
  }
}
