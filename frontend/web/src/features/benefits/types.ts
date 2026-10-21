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
export type BenefitField = {
  id: string
  label: string
  kind: 'text' | 'secret' | 'link'
  value: string
}

export type Benefit = {
  id: string
  name: string
  summary: string
  category: 'account' | 'license' | 'resource' | 'custom'
  tone: 'violet' | 'sky' | 'amber'
  format: 'markdown' | 'html'
  instructions: string
  fields: BenefitField[]
  stockMode: 'individual' | 'shared'
  validityDays: number
  enabled: boolean
  availableInventory?: number
}

export type InventoryItem = {
  id: string
  benefitId: string
  fields: BenefitField[]
  claimed: boolean
  benefitName?: string
  status?: 'available' | 'disabled' | 'reserved' | 'delivered' | 'removed'
  revision?: number
  createdAt?: number
  updatedAt?: number
  userId?: number
  orderId?: number
  receivedAt?: number
  history?: {
    id: number
    actorId: number
    action: string
    reason: string
    createdAt: number
  }[]
}

export type BenefitCode = {
  id: string
  code: string
  benefitId: string
  mode: 'single' | 'campaign'
  limit: number
  claimed: number
  target: 'all' | 'user'
  targetUserId?: number
  expires: string
  enabled: boolean
}

export type WarehouseItem = {
  userId?: number
  id: string
  benefit: Benefit
  fields: BenefitField[]
  received: string
  expires: string
  status: 'active' | 'expired'
  sourceCode: string
}

export type BenefitsData = {
  benefits: Benefit[]
  inventory: InventoryItem[]
  codes: BenefitCode[]
  warehouse: WarehouseItem[]
  inventoryCounts?: Record<string, number>
}

export type PreviewView = 'warehouse' | 'wallet' | 'admin' | 'popup'
