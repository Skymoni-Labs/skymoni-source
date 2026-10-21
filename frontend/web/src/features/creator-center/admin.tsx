import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Tabs, TabsList, TabsContent, TabsTrigger } from '@/components/ui/tabs'
import { SettingsSection } from '@/features/system-settings/components/settings-section'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { creatorRequest } from './api'
import { CreatorReviewPolicySetting } from './components/review-policy'
import { CreatorReviewQueue } from './components/review-queue'
import type { ReviewCatalog } from './lib/review'
import { CreatorShowcaseManagement } from './showcase-admin'

export function CreatorManagement() {
  const { t } = useTranslation()
  const auth = useAuthStore((s) => s.auth)
  const client = useQueryClient()
  const key = ['creator-admin', auth.user?.id, auth.session?.sid]
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      creatorRequest<ReviewCatalog>('/admin', { signal }),
    enabled: auth.user?.role === ROLE.SUPER_ADMIN,
    gcTime: 0,
  })
  if (auth.user?.role !== ROLE.SUPER_ADMIN) {
    return <EmptyState title={t('Permission denied')} />
  }
  if (query.isPending) return <LoadingState />
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />
  return (
    <SettingsSection title={t('Creator review')}>
      <Tabs defaultValue='review'>
        <TabsList>
          <TabsTrigger value='review'>作品审核</TabsTrigger>
          <TabsTrigger value='layout'>推荐编排</TabsTrigger>
        </TabsList>
        <TabsContent value='review' keepMounted>
          <CreatorReviewPolicySetting
            key={`policy:${auth.user.id}:${auth.session?.sid}`}
            policy={query.data.reviewPolicy}
            onChange={(reviewPolicy) =>
              client.setQueryData<ReviewCatalog>(
                key,
                (old) => old && { ...old, reviewPolicy }
              )
            }
            onRefresh={() => void query.refetch()}
          />
          <CreatorReviewQueue
            key={`${auth.user.id}:${auth.session?.sid}`}
            catalog={query.data}
            fetching={query.isFetching}
            onRefresh={() => void query.refetch()}
            onCatalogChange={(data) => client.setQueryData(key, data)}
          />
        </TabsContent>
        <TabsContent value='layout' keepMounted>
          <CreatorShowcaseManagement />
        </TabsContent>
      </Tabs>
    </SettingsSection>
  )
}
