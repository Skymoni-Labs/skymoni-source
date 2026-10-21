import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

export interface UpstreamCost {
  note?: string
  billing_type?: string
  cache_read_per_million?: number | null
  cache_write_per_million?: number | null
  cache_write_1h_per_million?: number | null
  tiers?: Array<{
    label: string
    min_tokens?: number
    max_tokens?: number
    input_per_million?: number | null
    output_per_million?: number | null
    per_request?: number | null
  }>
  provider: string
  source?: string
  observed_at?: string
  group?: string
  group_ratio?: number | null
  model_ratio?: number | null
  completion_ratio?: number | null
  request_usd?: number | null
  input_usd_per_million?: number | null
  output_usd_per_million?: number | null
}

export function useUpstreamCosts() {
  return useQuery({
    queryKey: ['skymoni-upstream-costs'],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean
        message?: string
        data: Record<string, UpstreamCost[]>
      }>('/api/models/upstream-costs')
      return requireServerSuccess(res.data).data
    },
    staleTime: 60_000,
  })
}
