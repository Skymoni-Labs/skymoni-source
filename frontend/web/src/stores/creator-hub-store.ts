import { create } from 'zustand'

import {
  creatorRequest,
  saveCreatorProfile,
  type CreatorMe,
} from '@/features/creator-center/api'
import {
  creatorProfileSchema,
  defaultCreatorProfile,
  validateOwnRelease,
  type CreatorProfile,
  type CreatorRelease,
} from '@/features/creator-center/lib/hub'
import type { Work } from '@/features/creator-center/types'

import { useCreatorStore } from './creator-store'

type HubStore = {
  profile: CreatorProfile
  pinned: string[]
  releases: CreatorRelease[]
  hydrate: (me: CreatorMe | null) => void
  saveProfile: (profile: CreatorProfile) => Promise<CreatorMe>
  togglePinned: (id: string) => Promise<void>
  saveRelease: (release: CreatorRelease, ownWorks: Work[]) => Promise<void>
  withdrawRelease: (id: string) => Promise<void>
}
export const useCreatorHubStore = create<HubStore>((set, get) => ({
  profile: { ...defaultCreatorProfile },
  pinned: [],
  releases: [],
  hydrate: (me) =>
    set({
      profile: me?.member.profile?.name
        ? me.member.profile
        : { ...defaultCreatorProfile },
      pinned: me?.member.pinned ?? [],
      releases: me?.releases ?? [],
    }),
  saveProfile: async (profile) => {
    const me = await saveCreatorProfile(
      creatorProfileSchema.parse(profile),
      get().pinned,
      []
    )
    get().hydrate(me)
    useCreatorStore.getState().hydrate(me)
    useCreatorStore.setState((state) => ({
      published: state.published.map((work) =>
        me.works.some((own) => own.id === work.id)
          ? { ...work, author: me.member.profile.name }
          : work
      ),
    }))
    return me
  },
  togglePinned: async (id) => {
    const current = get().pinned
    if (!current.includes(id) && current.length >= 6) {
      throw new Error('Pin up to six projects')
    }
    const pinned = current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]
    const me = await saveCreatorProfile(get().profile, pinned, [])
    get().hydrate(me)
  },
  saveRelease: async (release, works) => {
    if (
      get().releases.find((item) => item.id === release.id)?.status === 'review'
    ) {
      throw new Error('Withdraw the submission before editing')
    }
    const parsed = validateOwnRelease(release, works, get().releases)
    const saved = await creatorRequest<CreatorRelease>(
      `/me/releases/${encodeURIComponent(parsed.id)}`,
      { method: 'put', data: parsed }
    )
    set({
      releases: [
        saved,
        ...get().releases.filter((item) => item.id !== saved.id),
      ],
    })
  },
  withdrawRelease: async (id) => {
    const old = get().releases.find((item) => item.id === id)
    if (!old) return
    const saved = await creatorRequest<CreatorRelease>(
      `/me/releases/${encodeURIComponent(id)}`,
      { method: 'put', data: { ...old, status: 'draft' } }
    )
    set({
      releases: [saved, ...get().releases.filter((item) => item.id !== id)],
    })
  },
}))
