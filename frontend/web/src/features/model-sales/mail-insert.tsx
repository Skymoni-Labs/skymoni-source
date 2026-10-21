import { useQuery } from '@tanstack/react-query'
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
import { useState } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import type { MailFormValues } from '@/features/admin-mail/lib/schema'

import { appendSaleMarker, listSales, saleStatus } from './api'

export function SaleMailInsert({ onEdit }: { onEdit: () => void }) {
  const form = useFormContext<MailFormValues>()
  const format = useWatch({ control: form.control, name: 'format' })
  const list = useQuery({
    queryKey: ['model-sales'],
    queryFn: listSales,
    staleTime: 15000,
  })
  const [id, setId] = useState('')
  return (
    <div className='space-y-2 rounded-lg border p-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <label htmlFor='mail-sale-id' className='text-sm font-medium'>
          模型降价倒计时
        </label>
        <a
          href='/model-sales'
          className='ml-auto text-xs text-sky-500 underline'
        >
          管理活动
        </a>
      </div>
      <div className='flex flex-wrap gap-2'>
        <select
          id='mail-sale-id'
          className='bg-background min-w-0 flex-1 rounded-md border p-2 text-xs'
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          <option value=''>选择已保存活动</option>
          {list.data?.items
            .filter((s) =>
              ['draft', 'paused', 'scheduled', 'active'].includes(s.status)
            )
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} · {saleStatus[s.status]}
              </option>
            ))}
        </select>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={!id || format !== 'html'}
          onClick={() => {
            form.setValue(
              'content',
              appendSaleMarker(form.getValues('content'), id),
              { shouldDirty: true, shouldValidate: true }
            )
            onEdit()
            toast.success('已插入；请重新预览并保存草稿')
          }}
        >
          插入翻页倒计时
        </Button>
      </div>
      <p className='text-muted-foreground text-xs'>
        {format === 'html'
          ? 'GIF 翻页约 60 秒；附北京时间截止日期与实时活动页。未启用活动只显示预览。'
          : '请先选择 HTML 内容格式，再插入倒计时。'}
      </p>
      {list.isError && (
        <p className='text-destructive text-xs'>
          活动列表读取失败，请稍后重试。
        </p>
      )}
    </div>
  )
}
