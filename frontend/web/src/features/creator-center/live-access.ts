import { creatorRequest } from './api'

export type CreatorLiveAccess = {
  status: 'none' | 'authorized' | 'active' | 'suspended'
  suspended: boolean
}

export function watchCreatorAccess(
  previous: string | undefined,
  signal: AbortSignal
) {
  return creatorRequest<CreatorLiveAccess>(
    `/me/access?status=${encodeURIComponent(previous ?? '')}`,
    {
      signal,
      timeout: 35000,
    }
  )
}
