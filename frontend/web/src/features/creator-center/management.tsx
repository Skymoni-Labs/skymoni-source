import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuthStore } from '@/stores/auth-store'

import { CreatorManagement } from './admin'
import { CreatorHomeManagement } from './home-admin'

export function CreatorPlatformManagement() {
  const { t } = useTranslation()
  const root = useAuthStore((state) => state.auth.user?.role === 100)
  if (!root) {
    return (
      <main className='cp-management'>
        <EmptyState title={t('Permission denied')} />
      </main>
    )
  }
  return (
    <main className='cp-management'>
      <h1>{t('Creator review')}</h1>
      <Tabs defaultValue='content'>
        <TabsList>
          <TabsTrigger value='content'>{t('Creator review')}</TabsTrigger>
          <TabsTrigger value='home'>{t('Homepage showcase')}</TabsTrigger>
        </TabsList>
        <TabsContent value='content'>
          <CreatorManagement />
        </TabsContent>
        <TabsContent value='home'>
          <CreatorHomeManagement />
        </TabsContent>
      </Tabs>
    </main>
  )
}
