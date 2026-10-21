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
import { useCallback, useMemo } from 'react'

import { useStatus } from '@/hooks/use-status'

import { filterBusinessPricingGroups } from '../lib/group-display'
import { parsePricingVisibleGroups } from '../lib/group-visibility'

export function usePricingGroupSelection() {
  const { status } = useStatus()
  return useMemo(
    () => parsePricingVisibleGroups(status?.pricing_visible_groups),
    [status?.pricing_visible_groups]
  )
}

export function usePricingGroupFilter() {
  const selection = usePricingGroupSelection()
  return useCallback(
    (groups: string[]) => filterBusinessPricingGroups(groups, selection),
    [selection]
  )
}
