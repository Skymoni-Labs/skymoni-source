import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

export interface UserModelGroup {
  id: number
  name: string
  model_names: string[]
}

type GroupPayload = Pick<UserModelGroup, 'name' | 'model_names'>

const path = '/api/user/self/model-groups'

export const userModelGroupsQueryKey = ['user-model-groups'] as const

export async function getUserModelGroups(): Promise<UserModelGroup[]> {
  const response = await api.get<{ success: boolean; data: UserModelGroup[] }>(
    path
  )
  return requireServerSuccess(response.data).data
}

export function useUserModelGroups(enabled: boolean) {
  return useQuery({
    queryKey: userModelGroupsQueryKey,
    queryFn: getUserModelGroups,
    enabled,
  })
}

export async function saveUserModelGroup(
  payload: GroupPayload,
  id?: number
): Promise<UserModelGroup> {
  const response = id
    ? await api.put<{ success: boolean; data: UserModelGroup }>(
        `${path}/${id}`,
        payload
      )
    : await api.post<{ success: boolean; data: UserModelGroup }>(path, payload)
  return requireServerSuccess(response.data).data
}

export async function deleteUserModelGroup(id: number): Promise<void> {
  const response = await api.delete<{ success: boolean }>(`${path}/${id}`)
  requireServerSuccess(response.data)
}
