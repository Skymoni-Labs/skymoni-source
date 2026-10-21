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
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

export type ModelGroup = {
  name: string
  models: string[]
  managed: boolean
  ratio: number
  description: string
  selectable: boolean
}
export type ModelGroupCatalog = {
  version: string
  groups: ModelGroup[]
  models: string[]
}
export type ModelGroupChange = {
  name: string
  models: string[]
  mode: 'create' | 'merge' | 'replace'
  expected_version: string
  ratio?: number
  description?: string
  selectable?: boolean
}
export async function getModelGroups(): Promise<ModelGroupCatalog> {
  const response = await api.get('/api/model-groups')
  return requireServerSuccess(response.data).data
}
export async function saveModelGroup(change: ModelGroupChange): Promise<void> {
  const response = await api.post('/api/model-groups', change)
  requireServerSuccess(response.data)
}
