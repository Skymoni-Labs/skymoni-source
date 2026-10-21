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
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { useAuthStore } from '@/stores/auth-store'

import { listBenefitCodes } from '../api'

export function BenefitCodePicker(props: {
  value: number
  onChange: (value: number) => void
}) {
  const { t } = useTranslation()
  const auth = useAuthStore((state) => state.auth)
  const query = useInfiniteQuery({
    queryKey: ['benefits', 'code-picker', auth.user?.id, auth.session?.sid],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => listBenefitCodes(pageParam, signal),
    getNextPageParam: (page, pages) =>
      pages.length * 50 < page.total ? pages.length + 1 : undefined,
    gcTime: 0,
  })
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />
  const codes = query.data?.pages.flatMap((page) => page.items) ?? []
  return (
    <div className='space-y-2'>
      <NativeSelect
        className='w-full'
        value={props.value}
        disabled={query.isPending}
        onChange={(e) => props.onChange(Number(e.target.value))}
        aria-label={t('Linked benefit code')}
      >
        <option value={0}>{t('No linked benefit')}</option>
        {props.value > 0 &&
          !codes.some((x) => Number(x.id) === props.value) && (
            <option value={props.value}>#{props.value}</option>
          )}
        {codes
          .filter((code) => code.enabled || Number(code.id) === props.value)
          .map((code) => (
            <option key={code.id} value={code.id}>
              {code.code} · {t('Benefit')} #{code.benefitId}
              {code.targetUserId ? ` · #${code.targetUserId}` : ''}
            </option>
          ))}
      </NativeSelect>
      {query.hasNextPage && (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t('Load more')}
        </Button>
      )}
    </div>
  )
}
