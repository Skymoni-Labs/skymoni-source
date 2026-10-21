import { create } from 'zustand'

import { creatorRequest, type CreatorMe } from '@/features/creator-center/api'
import type { Category } from '@/features/creator-center/types'
import { accountIdentity, saveAccountIdentity } from '@/lib/site-identity'

import { useAuthStore } from './auth-store'
import { useCreatorHubStore } from './creator-hub-store'
import { useCreatorStore } from './creator-store'

export type CreatorAccessMode = 'visitor' | 'member' | 'eligible' | 'creator'
type Access = {
  manuallyGranted: boolean
  autoApproveWorks: boolean
  mode: CreatorAccessMode
  suspended: boolean
  termsVersion: string
  actor: string
  hydrate: (me: CreatorMe | null) => void
  apply: (application: {
    name: string
    bio: string
    direction: Category
    accepted: boolean
  }) => Promise<void>
}
export const useCreatorAccessStore = create<Access>((set, get) => ({
  manuallyGranted: false,
  autoApproveWorks: false,
  mode: 'visitor',
  suspended: false,
  termsVersion: '2026-10-08',
  actor: '',
  hydrate: (me) =>
    set({
      manuallyGranted: me?.manuallyGranted ?? false,
      autoApproveWorks: me?.autoApproveWorks ?? false,
      mode: me?.mode ?? 'visitor',
      suspended: me?.suspended ?? false,
      termsVersion: me?.termsVersion ?? '2026-10-08',
    }),
  apply: async (application) => {
    let me = await creatorRequest<CreatorMe>('/me/apply', {
      method: 'post',
      data: { ...application, termsVersion: get().termsVersion },
    })
    await saveAccountIdentity({ name: application.name })
    const user = useAuthStore.getState().auth.user
    if (user) {
      const identity = accountIdentity(user)
      me = {
        ...me,
        member: {
          ...me.member,
          profile: {
            ...me.member.profile,
            name: identity.name,
            avatar: identity.avatar,
          },
        },
      }
    }
    useCreatorHubStore.getState().hydrate(me)
    useCreatorStore.getState().hydrate(me)
    get().hydrate(me)
  },
}))
