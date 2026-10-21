import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

export type Policy = {
  creatorApplicationsOpen?: boolean
  redemptionRequired: boolean
  inviteRequired: boolean
  revision: number
}
export function useCommunityAccessPolicy() {
  return useQuery({
    queryKey: ['community-access-policy'],
    queryFn: async () => {
      const result = await api.get<{ success: boolean; data: Policy }>(
        '/api/community-access/policy',
        { skipAuthRefresh: true, skipErrorHandler: true }
      )
      return requireServerSuccess(result.data).data
    },
    staleTime: 10000,
    retry: false,
  })
}
