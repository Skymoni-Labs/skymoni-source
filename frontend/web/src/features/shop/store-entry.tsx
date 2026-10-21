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
import { useQuery } from '@tanstack/react-query'

import { ErrorState } from '@/components/error-state'
import { PublicLayout, AuthenticatedLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { PublicStorePreview } from '@/features/shop-public-preview'
import { useAuthStore } from '@/stores/auth-store'

import { loadPublicShopProducts } from './api'
import { StorePage } from './store-page'

export function StoreEntry() {
  const user = useAuthStore((state) => state.auth.user)
  if (user) {
    return (
      <AuthenticatedLayout>
        <StorePage />
      </AuthenticatedLayout>
    )
  }
  return <PublicCatalog />
}

function PublicCatalog() {
  const catalog = useQuery({
    queryKey: ['shop', 'public-catalog'],
    queryFn: ({ signal }) => loadPublicShopProducts(signal),
    staleTime: 30_000,
  })
  if (catalog.isPending || catalog.isError) {
    return (
      <PublicLayout>
        {catalog.isPending ? (
          <LoadingState />
        ) : (
          <ErrorState onRetry={() => void catalog.refetch()} />
        )}
      </PublicLayout>
    )
  }
  return (
    <PublicStorePreview
      production
      data={{
        products: catalog.data.items,
        balanceCents: 0,
        orders: [],
        inventory: [],
        codes: [],
        warehouse: [],
      }}
    />
  )
}
